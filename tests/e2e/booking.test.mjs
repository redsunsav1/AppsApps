// Бронь только с паспортом: риелтор получает ссылку, квартира остаётся свободной,
// бронь появляется в момент загрузки паспорта покупателем. Идёт последним.
import { q, post, BASE, check, finish } from './helpers.mjs';
import http from 'http';

// Подставной Profitbase: сервер приложения ходит сюда (PROFITBASE_BASE_URL в run.sh)
const pbCalls = [];
const pbServer = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : null;
    pbCalls.push({ method: req.method, path: u.pathname, token: u.searchParams.get('access_token'), body });
    res.setHeader('Content-Type', 'application/json');
    if (u.pathname === '/authentication') return res.end(JSON.stringify({ access_token: 'pbtok', remaining_time: 86400 }));
    if (u.pathname === '/property-types') return res.end(JSON.stringify([{ id: 1, customFields: [
      { id: 1, key: 'pbcf_bti', name: 'Номер для БТИ', type: 'text' },
      { id: 2, key: 'pbcf_agent', name: 'Агент PartnerBuild', type: 'text' },
      { id: 3, key: 'pbcf_client', name: 'Клиент PartnerBuild', type: 'text' },
    ] }]));
    if (req.method === 'PATCH' && /^\/properties\/[^/]+$/.test(u.pathname)) return res.end(JSON.stringify({ id: 1, custom_fields: Object.entries(body?.custom_fields || {}).map(([key, value], i) => ({ id: { pbcf_agent: 2, pbcf_client: 3 }[key] ?? 100 + i, name: key, value })) }));
    const m = u.pathname.match(/^\/properties\/([^/]+)\/status-change$/);
    if (m) return res.end(JSON.stringify({ id: m[1], status: body?.status }));
    res.statusCode = 404; res.end('{}');
  });
});
await new Promise((r) => pbServer.listen(Number(process.env.TEST_PB_PORT || 18092), '127.0.0.1', r));
const fieldCalls = (id) => pbCalls.filter((c) => c.method === 'PATCH' && c.path === `/properties/${id}`).map((c) => c.body?.custom_fields);
const statusCalls = (id) => pbCalls.filter((c) => c.path === `/properties/${id}/status-change`).map((c) => c.body?.status);
const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

await q(`INSERT INTO units (id, project_id, floor, number, rooms, area, price, status) VALUES
  ('b1', 'p1', 2, '21', 1, 40, 5000000, 'FREE'),
  ('b2', 'p1', 2, '22', 2, 55, 6500000, 'FREE'),
  ('b3', 'p1', 2, '23', 2, 56, 6600000, 'FREE')`);

const tokenOf = (url) => String(url || '').split('/consent/')[1];
const getConsent = async (token) => {
  const r = await fetch(`${BASE}/api/consent/${token}`);
  return { status: r.status, data: await r.json().catch(() => null) };
};
const accept = async (token) => {
  const r = await fetch(`${BASE}/api/consent/${token}/accept`, { method: 'POST' });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const upload = async (token) => {
  const form = new FormData();
  form.append('passport', new Blob([Buffer.from('fake-jpeg')], { type: 'image/jpeg' }), 'passport.jpg');
  const r = await fetch(`${BASE}/api/consent/${token}/passport`, { method: 'POST', body: form });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const buyer = { buyerName: 'Покупатель Тест', buyerPhone: '+79995550000' };

// --- Старая бронь без паспорта закрыта
let r = await post('/api/bookings', 1002, { unitId: 'b1', projectId: 'p1', ...buyer });
check('бронь без паспорта больше не создаётся', r.status === 409 && r.data?.code === 'passport_required', r);
check('квартира от этого не заблокировалась', (await q("SELECT status FROM units WHERE id = 'b1'"))[0].status === 'FREE');

// --- Заявка: ссылка есть, квартира свободна
r = await post('/api/booking-requests', 1004, { unitId: 'b1', projectId: 'p1', ...buyer });
check('до одобрения заявку не создать', r.status === 403, r);
r = await post('/api/booking-requests', 1002, { unitId: 'b1', projectId: 'p1', buyerName: '', buyerPhone: '' });
check('без данных покупателя заявку не создать', r.status === 400, r);

const anna = await post('/api/booking-requests', 1002, { unitId: 'b1', projectId: 'p1', ...buyer });
check('Анна получила ссылку для покупателя', anna.status === 200 && anna.data.requestId && tokenOf(anna.data.url), anna);
check('квартира после заявки всё ещё свободна', (await q("SELECT status FROM units WHERE id = 'b1'"))[0].status === 'FREE');
check('брони после заявки нет', (await q("SELECT count(*)::int c FROM bookings WHERE unit_id = 'b1'"))[0].c === 0);

const again = await post('/api/booking-requests', 1002, { unitId: 'b1', projectId: 'p1', ...buyer });
check('повторная заявка возвращает ту же ссылку', again.data?.requestId === anna.data.requestId && again.data.url === anna.data.url, again);

const boris = await post('/api/booking-requests', 1003, { unitId: 'b1', projectId: 'p1', ...buyer });
check('другой риелтор тоже может отправить ссылку на свободную квартиру', boris.status === 200 && boris.data.requestId !== anna.data.requestId, boris);

r = await post('/api/booking-requests/my', 1002);
check('заявка видна в «моих»', r.status === 200 && r.data.some((x) => x.unitId === 'b1' && x.id === anna.data.requestId), r);
r = await post(`/api/booking-requests/${anna.data.requestId}/status`, 1003);
check('чужую заявку не посмотреть', r.status === 403, r);

// --- Покупатель: согласие, потом паспорт
const tA = tokenOf(anna.data.url);
r = await getConsent(tA);
check('страница покупателя открывается по заявке', r.status === 200 && r.data.unitNumber === '21' && r.data.consentGiven === false, r);
r = await upload(tA);
check('без согласия паспорт не принять', r.status === 400, r);
check('без согласия брони нет', (await q("SELECT count(*)::int c FROM bookings WHERE unit_id = 'b1'"))[0].c === 0);
r = await accept(tA);
check('согласие принято', r.status === 200, r);
r = await post(`/api/booking-requests/${anna.data.requestId}/status`, 1002);
check('риелтор видит согласие, квартира ещё не забронирована', r.data?.consentGiven === true && r.data.passportSent === false, r);

r = await upload(tA);
check('паспорт принят', r.status === 200 && r.data?.success, r);
const [bk] = await q("SELECT * FROM bookings WHERE unit_id = 'b1' AND COALESCE(stage, 'INIT') != 'CANCELLED'");
check('бронь создана в момент паспорта, сразу «паспорт отправлен»', bk && bk.user_id === 2 && bk.stage === 'PASSPORT_SENT' && bk.passport_sent === true, bk);
check('согласие покупателя перенесено в бронь', bk?.buyer_consent === true && !!bk.buyer_consent_at && !!bk.buyer_consent_version, bk);
check('данные покупателя в брони', bk?.buyer_name === buyer.buyerName && bk.buyer_phone === buyer.buyerPhone, bk);
check('квартира забронирована', (await q("SELECT status FROM units WHERE id = 'b1'"))[0].status === 'BOOKED');
const reqs = await q("SELECT id, status, booking_id FROM booking_requests WHERE unit_id = 'b1' ORDER BY id");
check('заявка Анны стала бронью, заявка Бориса закрыта', reqs[0].status === 'BOOKED' && reqs[0].booking_id === bk.id && reqs[1].status === 'LOST', reqs);

check('квартира с паспортом забронирована в Profitbase', await waitFor(() => statusCalls('b1').includes('BOOKED')), pbCalls);
check('в Profitbase ходим с токеном', pbCalls.some((c) => c.path.includes('status-change') && c.token === 'pbtok'), pbCalls);
check('поля карточки квартиры в Profitbase не трогаем — только статус', fieldCalls('b1').length === 0, fieldCalls('b1'));
check('бронь помечена как переданная в Profitbase',
  await waitFor(async () => (await q('SELECT profitbase_reserved FROM bookings WHERE id = $1', [bk.id]))[0].profitbase_reserved === true));

r = await post(`/api/booking-requests/${anna.data.requestId}/status`, 1002);
check('риелтор видит, что бронь оформлена', r.data?.passportSent === true && r.data.bookingId === bk.id && !!r.data.expiresAt, r);
r = await upload(tA);
check('ссылка после брони больше не работает', r.status === 404, r);

const tB = tokenOf(boris.data.url);
r = await getConsent(tB);
check('ссылка Бориса закрыта после чужой брони', r.status === 404, r);
r = await post(`/api/booking-requests/${boris.data.requestId}/status`, 1003);
check('Борис видит, что квартиру заняли', r.data?.lost === true, r);

// --- Чужие брони и клиенты не видны другим риелторам
const unitsForBoris = (await post('/api/units/p1', 1003)).data;
const b1ForBoris = unitsForBoris.find((u) => u.id === 'b1');
check('другой риелтор видит только статус «забронирована»', b1ForBoris?.status === 'BOOKED', b1ForBoris);
check('в шахматке другого риелтора нет агента и клиента чужой брони',
  !JSON.stringify(unitsForBoris).match(/Покупатель Тест|79995550000|Петрова|79990000002|booking_buyer|booking_agent/), b1ForBoris);
const borisBookings = (await post('/api/bookings/my', 1003)).data;
check('в «моих бронях» другого риелтора нет чужой брони', Array.isArray(borisBookings) && !borisBookings.some((b) => b.unit_id === 'b1'), borisBookings);
r = await post('/api/bookings/all', 1003);
check('список всех броней риелтору закрыт', r.status === 403, r.status);
const unitsForAdmin = (await post('/api/units/p1', 1001)).data;
check('админ видит агента и клиента брони', unitsForAdmin.find((u) => u.id === 'b1')?.booking_buyer_name === 'Покупатель Тест');

r = await post('/api/booking-requests', 1003, { unitId: 'b1', projectId: 'p1', ...buyer });
check('на забронированную квартиру заявку не создать', r.status === 400, r);

// --- Квартиру продали, пока покупатель загружал паспорт
const late = await post('/api/booking-requests', 1003, { unitId: 'b2', projectId: 'p1', ...buyer });
const tL = tokenOf(late.data.url);
await accept(tL);
await q("UPDATE units SET status = 'SOLD' WHERE id = 'b2'");
r = await upload(tL);
check('проданную квартиру паспорт не бронирует', r.status === 409 && /уже забронировали/.test(r.data?.error || ''), r);
check('брони на проданную квартиру нет', (await q("SELECT count(*)::int c FROM bookings WHERE unit_id = 'b2'"))[0].c === 0);
check('заявка помечена как упущенная', (await q('SELECT status FROM booking_requests WHERE id = $1', [late.data.requestId]))[0].status === 'LOST');

check('по проданной квартире в Profitbase ничего не меняли', statusCalls('b2').length === 0, statusCalls('b2'));
check('по одной заявке без паспорта в Profitbase ничего не меняли', statusCalls('b3').length === 0);

// --- Бронь сняли — квартира возвращается в продажу в Profitbase
r = await post('/api/bookings/cancel', 1001, { unitId: 'b1' });
check('админ снял бронь', r.status === 200, r);
check('в Profitbase квартира снова свободна', await waitFor(() => statusCalls('b1').at(-1) === 'AVAILABLE'), statusCalls('b1'));
check('при снятии брони поля квартиры тоже не трогаем', fieldCalls('b1').length === 0, fieldCalls('b1'));
check('флаг брони в Profitbase снят',
  await waitFor(async () => (await q('SELECT profitbase_reserved FROM bookings WHERE id = $1', [bk.id]))[0].profitbase_reserved === false));

// --- Риелтор отменил заявку
const c = await post('/api/booking-requests', 1002, { unitId: 'b3', projectId: 'p1', ...buyer });
r = await post(`/api/booking-requests/${c.data.requestId}/cancel`, 1003);
check('чужую заявку не отменить', r.status === 403, r);
r = await post(`/api/booking-requests/${c.data.requestId}/cancel`, 1002);
check('свою заявку отменить можно', r.status === 200, r);
r = await getConsent(tokenOf(c.data.url));
check('после отмены ссылка не работает', r.status === 404, r);
check('после отмены квартира свободна', (await q("SELECT status FROM units WHERE id = 'b3'"))[0].status === 'FREE');

pbServer.close();
await finish();
