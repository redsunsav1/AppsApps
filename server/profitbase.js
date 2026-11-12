// Бронь квартиры в Profitbase застройщика.
//
// Отдел продаж смотрит шахматку Profitbase. Сделка в amoCRM сама по себе квартиру
// там не бронирует, и квартира с нашей бронью висела в Profitbase свободной.
// Теперь приложение само меняет статус через API Profitbase v4:
//   бронь с паспортом   → BOOKED (+ квартира привязывается к сделке amoCRM);
//   бронь снята/истекла → AVAILABLE (если квартира не продана).
//
// Включается двумя переменными в Amvera: PROFITBASE_ACCOUNT (поддомен pbXXXX
// или полный адрес) и PROFITBASE_API_KEY (ключ API-приложения Profitbase).
// Без них модуль ничего не делает.
//
// Документация: https://developer.profitbase.ru/ — POST /authentication,
// POST /properties/{id}/status-change, POST /crm/addPropertyDeal. Лимит API —
// один запрос в секунду, поэтому все вызовы идут через одну очередь.

export function profitbaseConfig(env = process.env) {
  const account = String(env.PROFITBASE_ACCOUNT || '').trim();
  const apiKey = String(env.PROFITBASE_API_KEY || '').trim();
  let baseUrl = String(env.PROFITBASE_BASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl && account) {
    baseUrl = /^https?:\/\//.test(account)
      ? `${account.replace(/\/$/, '')}/api/v4/json`
      : `https://${account.replace(/\.profitbase\.ru.*$/, '')}.profitbase.ru/api/v4/json`;
  }
  return {
    enabled: !!(baseUrl && apiKey),
    baseUrl,
    apiKey,
    bookedStatus: String(env.PROFITBASE_BOOKED_STATUS || 'BOOKED'),
    availableStatus: String(env.PROFITBASE_AVAILABLE_STATUS || 'AVAILABLE'),
    linkDeals: env.PROFITBASE_LINK_DEALS !== 'false',
    minIntervalMs: Math.max(0, parseInt(env.PROFITBASE_MIN_INTERVAL_MS || '1100', 10) || 0),
  };
}

export function createProfitbaseClient({ config = profitbaseConfig(), fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  let token = null;
  let tokenUntil = 0;
  let chain = Promise.resolve();
  let lastCallAt = 0;
  // Для диагностики (/api/bot/status): без ключа и токена
  const state = { lastAuthOk: null, lastAuthAt: null, lastOkAt: null, lastError: null, lastErrorAt: null };
  const noteError = (e) => { state.lastError = String(e?.message || e).slice(0, 300); state.lastErrorAt = new Date(now()).toISOString(); };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Одна очередь на все вызовы: Profitbase отвечает 429 чаще раза в секунду
  const enqueue = (fn) => {
    const run = chain.then(async () => {
      const wait = lastCallAt + config.minIntervalMs - now();
      if (wait > 0) await sleep(wait);
      lastCallAt = now();
      return fn();
    });
    chain = run.catch(() => {});
    return run;
  };

  async function readBody(res) {
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  async function authenticate() {
    const res = await fetchImpl(`${config.baseUrl}/authentication`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'api-app', credentials: { pb_api_key: config.apiKey } }),
    });
    const body = await readBody(res);
    state.lastAuthAt = new Date(now()).toISOString();
    state.lastAuthOk = !!(res.ok && body?.access_token);
    if (!res.ok || !body?.access_token) {
      throw new Error(`Profitbase: вход не удался (HTTP ${res.status}${body?.error ? `, ${typeof body.error === 'string' ? body.error : JSON.stringify(body.error)}` : ''})`);
    }
    token = body.access_token;
    // Токен живёт сутки; обновляем с запасом
    const ttl = Number(body.remaining_time) > 0 ? Number(body.remaining_time) * 1000 : 23 * 3600 * 1000;
    tokenUntil = now() + Math.max(60_000, ttl - 5 * 60_000);
    return token;
  }

  async function call(method, path, body, opts) {
    try {
      const out = await rawCall(method, path, body, opts);
      if (!out?.skipped) state.lastOkAt = new Date(now()).toISOString();
      return out;
    } catch (e) { noteError(e); throw e; }
  }

  async function rawCall(method, path, body, { retryAuth = true } = {}) {
    if (!config.enabled) return { skipped: true };
    if (!token || now() >= tokenUntil) await enqueue(authenticate);
    const res = await enqueue(() => fetchImpl(`${config.baseUrl}${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
    const data = await readBody(res);
    if ((res.status === 401 || res.status === 403) && retryAuth) {
      token = null;
      return rawCall(method, path, body, { retryAuth: false });
    }
    if (!res.ok) {
      const detail = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data?.error ?? data).slice(0, 200);
      throw new Error(`Profitbase ${method} ${path.split('?')[0]}: HTTP ${res.status} ${detail}`);
    }
    return data;
  }

  return {
    enabled: config.enabled,
    config,
    // Проверка ключа: только вход, статусы квартир не трогает
    ping: async () => {
      if (!config.enabled) return false;
      try { await enqueue(authenticate); return true; } catch (e) { noteError(e); return false; }
    },
    status: () => ({
      enabled: config.enabled,
      host: config.baseUrl ? config.baseUrl.replace(/^https?:\/\//, '').split('/')[0] : null,
      bookedStatus: config.bookedStatus,
      ...state,
    }),
    setStatus: (propertyId, status) =>
      call('POST', `/properties/${encodeURIComponent(propertyId)}/status-change`, { status }),
    reserve: (propertyId) =>
      call('POST', `/properties/${encodeURIComponent(propertyId)}/status-change`, { status: config.bookedStatus }),
    release: (propertyId) =>
      call('POST', `/properties/${encodeURIComponent(propertyId)}/status-change`, { status: config.availableStatus }),
    // Квартира в карточке сделки amoCRM. Нужен виджет «Profitbase для amoCRM» у застройщика.
    linkDeal: (propertyId, dealId) =>
      call('POST', '/crm/addPropertyDeal', { propertyId: Number(propertyId), dealId: Number(dealId) }),
  };
}
