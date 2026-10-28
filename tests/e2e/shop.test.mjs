// Магазин и золото: золото только за сверенные сделки, заморозка, гонка за последний
// приз, возвраты при отказе и отзыве сделки. Идёт первым: опирается на исходный seed.
import { q, post, check, finish } from './helpers.mjs';

const gold = async (uid) => (await q('SELECT gold_balance FROM users WHERE id = $1', [uid]))[0].gold_balance;

// --- Миграции
const legacy = await q("SELECT * FROM gold_ledger WHERE user_id = 2");
check('старое золото Анны перенесено в журнал замороженным', legacy.length === 1 && legacy[0].reason === 'legacy' && legacy[0].delta === 10 && legacy[0].available_at === null, legacy);
const dealQuest = (await q("SELECT * FROM quests WHERE type = 'DEAL'"))[0];
check('квест «Продать квартиру» выключен и не даёт золото', dealQuest.is_active === false && dealQuest.reward_currency === 'SILVER', dealQuest);
const m25 = (await q("SELECT * FROM missions WHERE code = 'bookings_25'"))[0];
check('миссия «25 броней» переведена на серебро', m25.reward_currency === 'SILVER' && m25.reward_amount === 2000, m25);

// --- Квест по кнопке
await q("UPDATE quests SET is_active = TRUE WHERE type = 'DEAL'");
let r = await post('/api/quests/claim', 1002, { questId: dealQuest.id });
check('квест-продажа не засчитывается кнопкой даже если его включить', r.status === 400, r);
await q("UPDATE quests SET is_active = FALSE WHERE type = 'DEAL'");
const share = (await q("SELECT * FROM quests WHERE type = 'SHARE'"))[0];
await q("UPDATE quests SET reward_currency = 'GOLD' WHERE id = $1", [share.id]);
const g0 = await gold(3);
r = await post('/api/quests/claim', 1003, { questId: share.id });
check('квест с GOLD в базе начисляет серебро, а не золото', r.status === 200 && (await gold(3)) === g0, { r, g: await gold(3) });

// --- Магазин: призы заведены каталогом при старте
const bySku = async (sku) => (await q('SELECT * FROM products WHERE sku = $1', [sku]))[0];
const [iphone, watch, airpods] = [await bySku('iphone-17-pro-max-1tb'), await bySku('apple-watch-s11'), await bySku('airpods-max')];
check('призы заведены: iPhone 4, часы 2, AirPods 1 золота, остаток 1',
  iphone.price === 4 && watch.price === 2 && airpods.price === 1 && [iphone, watch, airpods].every((p) => p.stock === 1 && p.currency === 'GOLD'),
  [iphone, watch, airpods]);

// --- Замороженное старое золото нельзя потратить
r = await post('/api/buy', 1002, { productId: iphone.id });
check('Анна не может купить iPhone на старое (непроверенное) золото', r.status === 400, r);
r = await post('/api/buy', 1004, { productId: airpods.id });
check('неодобренный партнёр не может покупать', r.status === 403, r);

// --- Бронь неодобренным партнёром
r = await post('/api/bookings', 1004, { unitId: 'u3', projectId: 'p1' });
check('неодобренный партнёр не может бронировать', r.status === 403, r);

// --- Подтверждение сделки: amoCRM не настроена → без ручной причины нельзя
r = await post('/api/bookings/101/complete', 1001, {});
check('сделка без сверки с amoCRM не подтверждается', r.status === 409 && Array.isArray(r.data?.problems), r);
r = await post('/api/bookings/101/complete', 1001, { override: true, overrideReason: 'коротко' });
check('ручное подтверждение требует причину', r.status === 400, r);
r = await post('/api/bookings/101/complete', 1001, { override: true, overrideReason: 'Проверил в amoCRM вручную: ДДУ подписан 20.10' });
check('ручное подтверждение с причиной проходит', r.status === 200 && r.data?.verified === false, r);
const dealEntry = (await q("SELECT * FROM gold_ledger WHERE booking_id = 101 AND reason = 'deal'"))[0];
check('золото за сделку в журнале и заморожено на 30 дней', dealEntry && dealEntry.delta === 1 && new Date(dealEntry.available_at) > new Date(Date.now() + 29 * 86400000) && /Подтверждено вручную/.test(dealEntry.note), dealEntry);
r = await post('/api/bookings/101/complete', 1001, { override: true, overrideReason: 'Повторная попытка подтверждения' });
check('повторно подтвердить ту же сделку нельзя', r.status === 400, r);

// --- Вторая сделка в другом ЖК → миссия «Покоритель всех ЖК» (5 золота, тоже в заморозке)
r = await post('/api/bookings/102/complete', 1001, { override: true, overrideReason: 'Проверил в amoCRM вручную: ДДУ подписан 21.10' });
await new Promise((res) => setTimeout(res, 800));
const mission = (await q("SELECT * FROM gold_ledger WHERE user_id = 3 AND reason = 'mission'"));
check('миссия по двум ЖК дала 5 золота через журнал, в заморозке', mission.length === 1 && mission[0].delta === 5 && mission[0].available_at && new Date(mission[0].available_at) > new Date(), mission);
check('баланс Бориса = 7 (1+1+5), кэш совпадает с журналом', (await gold(3)) === 7, await gold(3));

r = await post('/api/gold/me', 1003);
check('Борис видит: всего 7, доступно 0', r.data?.gold?.total === 7 && r.data?.gold?.available === 0, r.data);
r = await post('/api/buy', 1003, { productId: iphone.id });
check('замороженное золото за сделки не тратится', r.status === 400 && /заморозке/.test(r.data?.error || ''), r);

// --- Админ проверил и разморозил
for (const e of await q("SELECT id FROM gold_ledger WHERE user_id = 3 AND delta > 0")) {
  await post(`/api/admin/gold/${e.id}/release`, 1001);
}
r = await post('/api/gold/me', 1003);
check('после разморозки доступно 7', r.data?.gold?.available === 7, r.data);

// --- Гонка за последний iPhone: Борис шлёт 5 запросов одновременно
const race = await Promise.all([1, 2, 3, 4, 5].map(() => post('/api/buy', 1003, { productId: iphone.id })));
const ok = race.filter((x) => x.status === 200).length;
check('из 5 одновременных покупок прошла ровно одна', ok === 1, race.map((x) => [x.status, x.data?.error]));
check('остаток iPhone = 0, золото списано один раз', (await q('SELECT stock FROM products WHERE id = $1', [iphone.id]))[0].stock === 0 && (await gold(3)) === 3, await gold(3));
r = await post('/api/buy', 1003, { productId: iphone.id });
check('второй раз тот же приз не купить', r.status === 409, r);

// --- Отказ в заявке возвращает и золото, и приз
const order = (await q("SELECT * FROM orders WHERE user_id = 3 AND product_id = $1", [iphone.id]))[0];
check('заявка создана со статусом PENDING', order.status === 'PENDING', order);
r = await post(`/api/admin/orders/${order.id}/reject`, 1001, { note: 'Проверка' });
check('отказ: золото вернулось (7), приз снова в наличии', r.status === 200 && (await gold(3)) === 7 && (await q('SELECT stock FROM products WHERE id = $1', [iphone.id]))[0].stock === 1, { r, g: await gold(3) });
r = await post('/api/gold/me', 1003);
check('после отказа снова доступно 7', r.data?.gold?.available === 7, r.data);

// --- Одобрение
r = await post('/api/buy', 1003, { productId: watch.id });
const order2 = (await q("SELECT * FROM orders WHERE user_id = 3 AND product_id = $1", [watch.id]))[0];
r = await post(`/api/admin/orders/${order2.id}/approve`, 1001, {});
check('заявку на часы одобрили', r.status === 200 && (await q('SELECT status FROM orders WHERE id = $1', [order2.id]))[0].status === 'APPROVED', r);
r = await post(`/api/admin/orders/${order2.id}/reject`, 1001, { note: 'Передумали' });
check('разобранную заявку повторно не отклонить', r.status === 409, r);

// --- Отзыв сделки после траты: баланс в минус, миссия снимается
r = await post('/api/bookings/102/revoke', 1001, { reason: 'Сделка расторгнута' });
check('отзыв сделки: снята монета и миссия (7-2-1-5 = -1), предупреждение админу', r.status === 200 && (await gold(3)) === -1 && /потратил/.test(r.data?.warning || ''), { r, g: await gold(3) });

// --- Аннулирование старого золота Анны
r = await post(`/api/admin/gold/${legacy[0].id}/void`, 1001, { note: 'Накручено квестом' });
check('старое золото аннулировано, баланс Анны 0', r.status === 200 && (await gold(2)) === 0, { r, g: await gold(2) });
r = await post(`/api/admin/gold/${dealEntry.id}/void`, 1001, { note: 'Пробую снять сделку' });
check('золото за сделку нельзя аннулировать в обход отзыва сделки', r.status === 400, r);

// --- Обычный партнёр не может звать админские методы
r = await post('/api/admin/orders', 1003, {});
const r2 = await post(`/api/admin/gold/${legacy[0].id}/release`, 1003);
check('партнёр не имеет доступа к админским методам', r.status === 403 && r2.status === 403, [r.status, r2.status]);

// --- Журнал и кэш сходятся у всех
const mismatch = await q(`
  SELECT u.id, u.gold_balance, COALESCE(SUM(g.delta) FILTER (WHERE g.voided_at IS NULL), 0) AS ledger
  FROM users u LEFT JOIN gold_ledger g ON g.user_id = u.id GROUP BY u.id HAVING u.gold_balance <> COALESCE(SUM(g.delta) FILTER (WHERE g.voided_at IS NULL), 0)`);
check('у всех пользователей баланс = сумма журнала', mismatch.length === 0, mismatch);

await finish();
