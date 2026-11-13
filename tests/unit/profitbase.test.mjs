// Клиент Profitbase на подставном fetch: вход, повторное использование токена,
// перелогин при 401, лимит «запрос в секунду», адрес аккаунта.
import { profitbaseConfig, createProfitbaseClient, pickPartnerFields, verifyFieldsSaved } from '../../server/profitbase.js';

let fails = 0;
const check = (n, c, x) => { console.log(`${c ? '✅' : '❌'} ${n}${c ? '' : ' → ' + JSON.stringify(x)}`); if (!c) fails++; };

// --- Настройки
check('без ключа выключен', profitbaseConfig({ PROFITBASE_ACCOUNT: 'pb123' }).enabled === false);
check('поддомен → адрес API', profitbaseConfig({ PROFITBASE_ACCOUNT: 'pb123', PROFITBASE_API_KEY: 'k' }).baseUrl === 'https://pb123.profitbase.ru/api/v4/json');
check('полный адрес аккаунта тоже понимает', profitbaseConfig({ PROFITBASE_ACCOUNT: 'pb123.profitbase.ru', PROFITBASE_API_KEY: 'k' }).baseUrl === 'https://pb123.profitbase.ru/api/v4/json');
check('статусы по умолчанию', (() => { const c = profitbaseConfig({}); return c.bookedStatus === 'BOOKED' && c.availableStatus === 'AVAILABLE'; })());

// --- Выключенный клиент ничего не шлёт
let calls = [];
const off = createProfitbaseClient({ config: profitbaseConfig({}), fetchImpl: async () => { calls.push(1); } });
check('выключенный клиент пропускает вызов', (await off.reserve('1')).skipped === true && calls.length === 0);

// --- Рабочий сценарий
calls = [];
let authN = 0;
let expireNext = false;
const mockFetch = async (url, opts) => {
  const u = new URL(url);
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ path: u.pathname.replace('/api/v4/json', ''), token: u.searchParams.get('access_token'), body, at: Date.now() });
  const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
  if (u.pathname.endsWith('/authentication')) {
    if (body?.credentials?.pb_api_key !== 'key-1') return json(403, { error: 'Not allowed.' });
    authN++;
    return json(200, { access_token: `tok${authN}`, remaining_time: 86400 });
  }
  if (expireNext) { expireNext = false; return json(401, { error: 'expired' }); }
  if (u.pathname.includes('/status-change')) return json(200, { id: 1, status: body.status });
  if (u.pathname.endsWith('/crm/addPropertyDeal')) return json(200, { success: true });
  return json(404, {});
};
const cfg = profitbaseConfig({ PROFITBASE_ACCOUNT: 'pbtest', PROFITBASE_API_KEY: 'key-1', PROFITBASE_MIN_INTERVAL_MS: '50' });
const pb = createProfitbaseClient({ config: cfg, fetchImpl: mockFetch });

let r = await pb.reserve('16039556');
check('бронь: вход и смена статуса на BOOKED', r.status === 'BOOKED' && calls[0].path === '/authentication' && calls[1].path === '/properties/16039556/status-change' && calls[1].token === 'tok1', calls);
await pb.release('16039556');
check('токен используется повторно', authN === 1 && calls[2].body.status === 'AVAILABLE' && calls[2].token === 'tok1', calls);
await pb.linkDeal('16039556', '777');
check('привязка к сделке числами', calls[3].path === '/crm/addPropertyDeal' && calls[3].body.propertyId === 16039556 && calls[3].body.dealId === 777, calls[3]);

expireNext = true;
r = await pb.reserve('5');
check('после 401 входит заново и повторяет', r.status === 'BOOKED' && authN === 2 && calls.at(-1).token === 'tok2', calls.slice(-3));

const gaps = calls.slice(1).map((c, i) => c.at - calls[i].at);
check('между запросами не меньше заданного интервала', gaps.every((g) => g >= 45), gaps);

// Параллельные вызовы тоже идут по одному
const t0 = calls.length;
await Promise.all([pb.reserve('a'), pb.reserve('b'), pb.reserve('c')]);
const par = calls.slice(t0).map((c) => c.at);
check('параллельные вызовы выстраиваются в очередь', par.length === 3 && par[1] - par[0] >= 45 && par[2] - par[1] >= 45, par);

// --- Неверный ключ — понятная ошибка
const bad = createProfitbaseClient({ config: profitbaseConfig({ PROFITBASE_ACCOUNT: 'pbtest', PROFITBASE_API_KEY: 'wrong', PROFITBASE_MIN_INTERVAL_MS: '0' }), fetchImpl: mockFetch });
try { await bad.reserve('1'); check('неверный ключ даёт ошибку', false); }
catch (e) { check('неверный ключ даёт понятную ошибку', /вход не удался.*403/.test(e.message), e.message); }

// --- Диагностика без секретов
const st = pb.status();
check('статус: адрес и успешный вход, без ключа и токена', st.enabled && st.host === 'pbtest.profitbase.ru' && st.lastAuthOk === true && !JSON.stringify(st).includes('key-1') && !JSON.stringify(st).includes('tok'), st);
check('ping проверяет ключ', (await pb.ping()) === true && (await bad.ping()) === false && /403/.test(bad.status().lastError || ''), bad.status());

// --- Поля «Агент» и «Клиент» по названию
let pf = pickPartnerFields([
  { key: 'pbcf_1', name: 'Номер для БТИ', type: 'text' },
  { key: 'pbcf_2', name: 'Агент (PartnerBuild)', type: 'text' },
  { key: 'pbcf_3', name: 'Покупатель', type: 'text' },
]);
check('находит поля агента и клиента', pf.agent?.key === 'pbcf_2' && pf.client?.key === 'pbcf_3', pf);
pf = pickPartnerFields([{ key: 'n', name: 'Риелтор', type: 'number' }, { key: 't', name: 'Риелтор ФИО', type: 'text' }]);
check('текстовое поле предпочтительнее', pf.agent?.key === 't' && pf.client === null, pf);
check('нет полей — ничего', (() => { const x = pickPartnerFields([]); return x.agent === null && x.client === null; })());

// --- Проверка, что Profitbase сохранил поля
const w = [{ id: 10, key: 'pbcf_a', name: 'Агент', value: 'Анна · +7' }, { id: 11, key: 'pbcf_c', name: 'Клиент', value: 'Иван · +7' }];
check('значения на месте — verified', verifyFieldsSaved({ custom_fields: [{ id: 10, name: 'Агент', value: 'Анна · +7' }, { id: 11, name: 'Клиент', value: 'Иван · +7' }] }, w).verified === true);
const miss = verifyFieldsSaved({ custom_fields: [{ id: 10, name: 'Агент', value: '' }] }, w);
check('пустое значение — не сохранено, с названиями полей', miss.verified === false && /Агент/.test(miss.detail) && /Клиент/.test(miss.detail), miss);
check('нет custom_fields в ответе — проверить нечем', verifyFieldsSaved({ id: 1 }, w).verified === null);
check('очистка: поле пропало из ответа — это ок', verifyFieldsSaved({ custom_fields: [] }, [{ id: 10, name: 'Агент', value: '' }]).verified === true);
check('в итоге проверки нет самих значений', !JSON.stringify(miss).includes('Анна'), miss);

// --- Подбор формата: живой аккаунт молча игнорирует формат из документации
{
  const store = {};
  const patches = [];
  const fx = async (url, opts) => {
    const u = new URL(url);
    const body = opts.body ? JSON.parse(opts.body) : null;
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (u.pathname.endsWith('/authentication')) return json(200, { access_token: 't', remaining_time: 86400 });
    if (u.pathname.endsWith('/property-types')) return json(200, [{ customFields: [
      { id: 1110500, key: 'pbcf_a', name: 'Агент КлубПартнеров', type: 'text' },
      { id: 1110501, key: 'pbcf_c', name: 'Клиент КлубПартнеров', type: 'text' }] }]);
    if (opts.method === 'PATCH') {
      patches.push(body.custom_fields);
      // Сохраняется только список с числовыми id
      if (Array.isArray(body.custom_fields) && typeof body.custom_fields[0]?.id === 'number') {
        for (const c of body.custom_fields) store[c.id] = c.value;
      }
      return json(200, { id: 17607838, status: 'BOOKED' });
    }
    if (u.pathname.endsWith('/property')) return json(200, { data: [{ id: 17607838, custom_fields: [
      { id: 'pbcf_a', name: 'Агент КлубПартнеров', value: store[1110500] ?? null },
      { id: 'pbcf_c', name: 'Клиент КлубПартнеров', value: store[1110501] ?? null }] }] });
    return json(404, {});
  };
  const pc = createProfitbaseClient({ config: profitbaseConfig({ PROFITBASE_ACCOUNT: 'pbx', PROFITBASE_API_KEY: 'k', PROFITBASE_MIN_INTERVAL_MS: '0' }), fetchImpl: fx });
  await pc.writePartnerFields('17607838', { agent: 'Анна · +7', client: 'Иван · +7' });
  const st2 = pc.status().lastFieldsWrite;
  check('подбирает рабочий формат и проверяет перечитыванием', st2.verified === true && st2.format === 'id_list' && store[1110500] === 'Анна · +7', st2);
  const before = patches.length;
  await pc.writePartnerFields('17607838', { agent: '', client: '' });
  check('сработавший формат запоминается', patches.length - before === 1 && Array.isArray(patches.at(-1)), patches.slice(before));

  // Ни один формат не сохраняется — понятная диагностика без значений
  const fy = async (url, opts) => {
    const u = new URL(url);
    const json = (status, data) => ({ ok: true, status, text: async () => JSON.stringify(data) });
    if (u.pathname.endsWith('/authentication')) return json(200, { access_token: 't', remaining_time: 86400 });
    if (u.pathname.endsWith('/property-types')) return json(200, [{ customFields: [{ id: 1, key: 'pbcf_a', name: 'Агент', type: 'text' }] }]);
    if (opts.method === 'PATCH') return json(200, { id: 5 });
    if (u.pathname.endsWith('/property')) return json(200, [{ id: 5, number: '1', custom_fields: [{ id: 'pbcf_bti', name: 'Номер БТИ', value: '7' }] }]);
    return json(404, {});
  };
  const py = createProfitbaseClient({ config: profitbaseConfig({ PROFITBASE_ACCOUNT: 'pbx', PROFITBASE_API_KEY: 'k', PROFITBASE_MIN_INTERVAL_MS: '0' }), fetchImpl: fy });
  let thrown = null;
  try { await py.writePartnerFields('5', { agent: 'Секрет Агент · +7999', client: 'x' }); } catch (e) { thrown = e; }
  const sy = py.status().lastFieldsWrite;
  check('если не сохранилось — ошибка и видно, какие поля есть у квартиры', thrown && sy.verified === false && sy.tried.length === 4 && sy.visibleCustomFields.includes('Номер БТИ'), sy);
  check('в диагностике нет значений', !JSON.stringify(py.status()).includes('Секрет'), sy);
}

if (fails) { console.error(`\n${fails} проверок не прошло`); process.exit(1); }
console.log('\nВсе проверки пройдены');
