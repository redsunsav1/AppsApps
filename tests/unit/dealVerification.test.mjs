// Сверка сделки с amoCRM на подставных ответах: без сети и без базы.
import { verifyDealInAmo, phoneKey } from '../../server/dealVerification.js';
let fails = 0;
const check = (n, c, x) => { console.log(`${c ? '✅' : '❌'} ${n}${c ? '' : ' → ' + JSON.stringify(x)}`); if (!c) fails++; };
const booked = new Date('2026-10-01T10:00:00Z');
const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);
const mk = ({ status = 142, contacts = [], leadStatus = 200, contactsStatus = 200 }) => async (url) => {
  if (url.includes('/leads/')) return leadStatus === 204 ? { status: 204, ok: true } : { status: leadStatus, ok: leadStatus < 300, json: async () => ({ id: 5001, status_id: status }) };
  if (url.includes('/contacts')) return contactsStatus === 204 || !contacts.length ? { status: 204, ok: true } : { status: contactsStatus, ok: contactsStatus < 300, json: async () => ({ _embedded: { contacts } }) };
};
const contact = (id, phone, iso, name = 'Иван') => ({ id, name, created_at: ts(iso), custom_fields_values: [{ field_code: 'PHONE', values: [{ value: phone }] }] });
const base = { leadId: '5001', buyerPhone: '+7 (999) 000-11-22', bookingCreatedAt: booked, subdomain: 'x', token: 't', statusNames: { 777: 'Устная бронь' } };

check('телефоны разного формата приводятся к одному ключу', phoneKey('+7 (999) 000-11-22') === phoneKey('89990001122'));
let r = await verifyDealInAmo({ ...base, fetchImpl: mk({}) });
check('лид выигран, покупатель новый → ок', r.ok && r.checked, r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ status: 777 }) });
check('лид не выигран → отказ с названием этапа', !r.ok && /Устная бронь/.test(r.problems[0]), r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ contacts: [contact(9, '8 999 000 11 22', '2026-09-15T00:00:00Z')] }) });
check('покупатель был в базе до брони → отказ', !r.ok && /уже был в базе/.test(r.problems[0]), r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ contacts: [contact(9, '+79990001122', '2026-10-05T00:00:00Z')] }) });
check('контакт создан отделом продаж после брони → ок', r.ok, r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ contacts: [contact(9, '+79990001199', '2026-09-01T00:00:00Z')] }) });
check('нечёткое совпадение поиска с другим номером не мешает', r.ok, r);
r = await verifyDealInAmo({ ...base, leadId: null, fetchImpl: mk({}) });
check('бронь без лида → отказ', !r.ok && r.checked, r);
r = await verifyDealInAmo({ ...base, buyerPhone: '', fetchImpl: mk({}) });
check('без телефона покупателя → отказ', !r.ok && /телефона покупателя/.test(r.problems.join()), r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ leadStatus: 500 }) });
check('amoCRM упала → «проверить не удалось», не «подтверждено»', !r.ok && !r.checked, r);
r = await verifyDealInAmo({ ...base, fetchImpl: mk({ leadStatus: 204 }) });
check('лид удалён → отказ', !r.ok && /не найден/.test(r.problems[0]), r);
r = await verifyDealInAmo({ ...base, subdomain: '', fetchImpl: mk({}) });
check('amoCRM не настроена → отказ', !r.ok && !r.checked, r);
console.log(fails ? `${fails} не прошло` : 'Все проверки прошли'); process.exit(fails ? 1 : 0);
