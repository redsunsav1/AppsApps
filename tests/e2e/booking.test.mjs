// Бронь только с паспортом: риелтор получает ссылку, квартира остаётся свободной,
// бронь появляется в момент загрузки паспорта покупателем. Идёт последним.
import { q, post, BASE, check, finish } from './helpers.mjs';

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

r = await post(`/api/booking-requests/${anna.data.requestId}/status`, 1002);
check('риелтор видит, что бронь оформлена', r.data?.passportSent === true && r.data.bookingId === bk.id && !!r.data.expiresAt, r);
r = await upload(tA);
check('ссылка после брони больше не работает', r.status === 404, r);

const tB = tokenOf(boris.data.url);
r = await getConsent(tB);
check('ссылка Бориса закрыта после чужой брони', r.status === 404, r);
r = await post(`/api/booking-requests/${boris.data.requestId}/status`, 1003);
check('Борис видит, что квартиру заняли', r.data?.lost === true, r);

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

// --- Риелтор отменил заявку
const c = await post('/api/booking-requests', 1002, { unitId: 'b3', projectId: 'p1', ...buyer });
r = await post(`/api/booking-requests/${c.data.requestId}/cancel`, 1003);
check('чужую заявку не отменить', r.status === 403, r);
r = await post(`/api/booking-requests/${c.data.requestId}/cancel`, 1002);
check('свою заявку отменить можно', r.status === 200, r);
r = await getConsent(tokenOf(c.data.url));
check('после отмены ссылка не работает', r.status === 404, r);
check('после отмены квартира свободна', (await q("SELECT status FROM units WHERE id = 'b3'"))[0].status === 'FREE');

await finish();
