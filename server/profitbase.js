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
    // Ключи пользовательских полей квартиры (pbcf_...). Если не заданы — ищем по названию.
    agentFieldKey: String(env.PROFITBASE_FIELD_AGENT || '').trim(),
    clientFieldKey: String(env.PROFITBASE_FIELD_CLIENT || '').trim(),
    minIntervalMs: Math.max(0, parseInt(env.PROFITBASE_MIN_INTERVAL_MS || '1100', 10) || 0),
  };
}

export function createProfitbaseClient({ config = profitbaseConfig(), fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  let token = null;
  let tokenUntil = 0;
  let chain = Promise.resolve();
  let lastCallAt = 0;
  // Для диагностики (/api/bot/status): без ключа и токена
  const state = { lastAuthOk: null, lastAuthAt: null, lastOkAt: null, lastError: null, lastErrorAt: null, fields: null, lastFieldsWrite: null };
  let fieldsCache = null;
  let fieldsCachedAt = 0;
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

  // Поля «Агент» и «Клиент» в карточке квартиры: берём из настроек или находим по названию
  async function resolveFields() {
    if (config.agentFieldKey || config.clientFieldKey) {
      return { agent: config.agentFieldKey ? { key: config.agentFieldKey, name: config.agentFieldKey } : null,
               client: config.clientFieldKey ? { key: config.clientFieldKey, name: config.clientFieldKey } : null };
    }
    // Найденные поля помним час; не найденные ищем снова через 5 минут — их могли только что создать
    const ttl = fieldsCache && (fieldsCache.agent || fieldsCache.client) ? 3600_000 : 300_000;
    if (fieldsCache && now() - fieldsCachedAt < ttl) return fieldsCache;
    const data = await call('GET', '/property-types');
    const types = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : data ? [data] : [];
    fieldsCache = pickPartnerFields(types.flatMap((t) => (Array.isArray(t?.customFields) ? t.customFields : [])));
    fieldsCachedAt = now();
    state.fields = { agent: fieldsCache.agent?.name || null, client: fieldsCache.client?.name || null };
    return fieldsCache;
  }

  // Форматы записи пользовательских полей. Документация показывает первый, но на
  // живом аккаунте он может молча игнорироваться — тогда пробуем остальные и
  // запоминаем сработавший.
  const FIELD_FORMATS = {
    key_map: (items) => ({ custom_fields: Object.fromEntries(items.map((w) => [w.key, w.value])) }),
    id_map: (items) => ({ custom_fields: Object.fromEntries(items.map((w) => [String(w.id ?? w.key), w.value])) }),
    key_list: (items) => ({ custom_fields: items.map((w) => ({ id: w.key, value: w.value })) }),
    id_list: (items) => ({ custom_fields: items.map((w) => ({ id: w.id ?? w.key, value: w.value })) }),
  };
  let workingFormat = null;

  async function readPropertyFields(propertyId) {
    const data = await call('GET', `/property?id=${encodeURIComponent(propertyId)}&full=true`);
    const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data
      : Array.isArray(data?.properties) ? data.properties : data?.data && typeof data.data === 'object' ? [data.data] : [data];
    const prop = list.find((p) => String(p?.id) === String(propertyId)) || list[0] || null;
    return { prop, topKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 10) : [typeof data] };
  }

  async function writePartnerFields(propertyId, { agent, client }) {
    const f = await resolveFields();
    const items = [
      f.agent && { ...f.agent, value: agent ?? '' },
      f.client && { ...f.client, value: client ?? '' },
    ].filter(Boolean);
    if (!items.length) return { skipped: true, reason: 'no_fields' };

    const order = [workingFormat, ...Object.keys(FIELD_FORMATS)].filter((x, i, arr) => x && arr.indexOf(x) === i);
    const tried = [];
    let lastRead = null;
    for (const fmt of order) {
      let res;
      try {
        res = await call('PATCH', `/properties/${encodeURIComponent(propertyId)}`, FIELD_FORMATS[fmt](items));
      } catch (e) {
        tried.push(`${fmt}: ${String(e.message).slice(0, 80)}`);
        continue;
      }
      // Сначала ответ на запись, потом — перечитанная квартира: она надёжнее
      let check = verifyFieldsSaved(res, items);
      if (check.verified !== true) {
        lastRead = await readPropertyFields(propertyId).catch((e) => ({ error: e.message }));
        if (lastRead?.prop) check = verifyFieldsSaved(lastRead.prop, items);
      }
      if (check.verified === true) {
        workingFormat = fmt;
        state.lastFieldsWrite = { at: new Date(now()).toISOString(), propertyId: String(propertyId), verified: true, format: fmt, tried };
        return res;
      }
      tried.push(`${fmt}: ${check.detail}`);
    }
    // Ни один формат не сохранился. В диагностику — какие поля Profitbase вообще
    // показывает у этой квартиры (только названия, без значений: это ПДн).
    const visible = Array.isArray(lastRead?.prop?.custom_fields)
      ? lastRead.prop.custom_fields.map((c) => c?.name || c?.id).slice(0, 30) : null;
    state.lastFieldsWrite = {
      at: new Date(now()).toISOString(), propertyId: String(propertyId), verified: false, tried,
      readError: lastRead?.error || null,
      propertyKeys: lastRead?.prop && typeof lastRead.prop === 'object' ? Object.keys(lastRead.prop).slice(0, 40) : null,
      responseTopKeys: lastRead?.topKeys || null,
      visibleCustomFields: visible,
    };
    const err = new Error(`Profitbase не сохранил поля агента и клиента ни в одном формате (${tried.join('; ').slice(0, 200)})`);
    noteError(err);
    throw err;
  }

  return {
    enabled: config.enabled,
    config,
    resolveFields,
    // Записать в карточку квартиры, кто и на кого забронировал (пустые строки — очистить)
    writePartnerFields,
    clearPartnerFields: (propertyId) => writePartnerFields(propertyId, { agent: '', client: '' }),
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

// Из списка пользовательских полей Profitbase выбираем «Агент» и «Клиент» по названию.
// Текстовые поля предпочтительнее: в число или список строку не записать.
export function pickPartnerFields(fields = []) {
  const uniq = [...new Map(fields.filter((f) => f && f.key).map((f) => [f.key, f])).values()];
  const score = (f) => (/^(text|string|textarea)$/i.test(f.type || '') ? 0 : 1);
  const find = (re) => uniq.filter((f) => re.test(String(f.name || ''))).sort((a, b) => score(a) - score(b))[0] || null;
  const agent = find(/агент|риелтор|риэлтор/i);
  const client = find(/клиент|покупател/i);
  return {
    agent: agent ? { key: agent.key, name: agent.name, id: agent.id } : null,
    client: client && client.key !== agent?.key ? { key: client.key, name: client.name, id: client.id } : null,
  };
}

// Проверка ответа PATCH /properties/{id}: в нём custom_fields — массив { id, name, value }.
// verified: true — значения на месте; false — поле есть, а значения нет; null — проверить нечем.
export function verifyFieldsSaved(res, written = []) {
  const shape = res && typeof res === 'object' ? Object.keys(res).slice(0, 12) : [typeof res];
  const list = [res?.custom_fields, res?.data?.custom_fields, res?.property?.custom_fields, res?.data?.[0]?.custom_fields]
    .find((x) => Array.isArray(x));
  if (!list) return { verified: null, detail: 'в ответе нет custom_fields', shape };
  const norm = (v) => String(v ?? '').trim();
  const missing = written.filter((w) => {
    const item = list.find((c) => (w.id != null && String(c?.id) === String(w.id)) || String(c?.id) === String(w.key) || c?.key === w.key || c?.name === w.name);
    if (!item) return norm(w.value) !== '';
    return norm(item.value) !== norm(w.value);
  });
  return missing.length
    ? { verified: false, detail: `не сохранено: ${missing.map((m) => m.name).join(', ')}`, shape }
    : { verified: true, detail: 'ok', shape };
}
