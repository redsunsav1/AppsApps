// Доступ и согласия: закрытые данные, скрытый супер-приз, отдельные согласия
// на рекламу и рейтинг, страницы правил. Идёт после shop.test.mjs.
import { q, get, post, check, finish } from './helpers.mjs';

// --- Данные клуба видят только подтверждённые партнёры
for (const path of ['/api/products', '/api/news', '/api/quests', '/api/mortgage-programs', '/api/projects', '/api/leaderboard']) {
  const anon = await get(path);
  const pending = await get(path, 1004);
  const partner = await get(path, 1003);
  check(`${path}: без входа и до одобрения закрыто, партнёру открыто`,
    anon.status === 401 && pending.status === 401 && partner.status === 200, [anon.status, pending.status, partner.status]);
}

// --- Супер-приз скрыт от партнёров даже в ответе сервера
const partnerProducts = (await get('/api/products', 1003)).data;
const teaser = partnerProducts.find((p) => p.is_teaser);
check('партнёр видит «Супер-приз» без цены и настоящего названия',
  teaser && teaser.title === 'Супер-приз' && teaser.price === null && !JSON.stringify(partnerProducts).includes('Бали'), teaser);
const adminProducts = (await get('/api/products', 1001)).data;
check('админ видит настоящее название супер-приза', adminProducts.some((p) => p.is_teaser && /Бали/.test(p.title)), adminProducts.map((p) => p.title));
let r = await post('/api/buy', 1003, { productId: teaser.id });
check('заявку на скрытый приз оформить нельзя', r.status === 409, r);

// --- Квесты: чужой прогресс по userId не подсмотреть
r = await get('/api/quests?userId=2', 1003);
check('партнёр получает свои квесты, а не чужие по userId', r.status === 200 && Array.isArray(r.data), r.status);

// --- Рейтинг обезличен без согласия
let board = (await get('/api/leaderboard', 1003)).data;
const anna = board.find((u) => u.id === 2);
check('без согласия на рейтинг имя и компания скрыты', anna && anna.name === 'Партнёр #2' && !anna.company, anna);
check('в рейтинге нет telegram_id', board.every((u) => !('telegram_id' in u)), board[0]);
r = await post('/api/privacy/preferences', 1002, { marketing: true, leaderboard: true });
check('партнёр включает согласия в профиле', r.status === 200, r);
board = (await get('/api/leaderboard', 1003)).data;
check('после согласия имя видно в рейтинге', board.find((u) => u.id === 2)?.name === 'Анна', board.find((u) => u.id === 2));
const prefs = (await q('SELECT marketing_consent, marketing_consent_version, leaderboard_consent FROM users WHERE id = 2'))[0];
check('согласие записано с версией текста', prefs.marketing_consent && prefs.marketing_consent_version && prefs.leaderboard_consent, prefs);
r = await post('/api/privacy/preferences', 1002, { marketing: false, leaderboard: true });
const off = (await q('SELECT marketing_consent, marketing_consent_at FROM users WHERE id = 2'))[0];
check('отзыв рекламного согласия применяется сразу', !off.marketing_consent && off.marketing_consent_at === null, off);
const audit = await q("SELECT 1 FROM audit_log WHERE action = 'privacy.preferences_change' AND actor_user_id = 2");
check('изменение согласий попадает в журнал', audit.length === 2, audit.length);

// --- Партнёр, зарегистрированный до отдельных согласий, не теряет вход по ссылке
r = await post('/api/auth', 1005);
check('старый партнёр без consent_pd получает токен для входа по ссылке', r.status === 200 && !!r.data?.user?.pwa_token, r.data?.user?.pwa_token);
const tok = r.data.user.pwa_token;
r = await post('/api/auth/token', null, { token: tok });
check('вход по ссылке с этим токеном работает', r.status === 200 && r.data?.user?.id === 5, r.status);

// --- Новый человек: имя из мессенджера не сохраняется до согласия
r = await post('/api/auth', 2001);
const fresh = (await q('SELECT first_name, username, pwa_token FROM users WHERE telegram_id = 2001'))[0];
check('до регистрации имя не пишется в базу и токен не выдаётся', fresh && !fresh.first_name && !fresh.pwa_token, fresh);

// --- Админские вызовы
r = await post('/api/admin/gold/unverified', 1001);
check('админ видит, у кого золото на проверке', r.status === 200 && Array.isArray(r.data), r);
r = await post('/api/admin/gold/unverified', 1003);
const r2 = await post('/api/admin/audit', 1003);
check('партнёру админские сводки недоступны', r.status === 403 && r2.status === 403, [r.status, r2.status]);
r = await post('/api/admin/audit', 1001, { action: 'booking.' });
check('журнал фильтруется по типу действия', r.status === 200 && r.data.length > 0 && r.data.every((e) => e.action.startsWith('booking.')), r.data?.map((e) => e.action));

// --- Кнопки одобрения заявок в Telegram нажимает только админ
const cb = (fromId) => fetch(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:18090'}/api/telegram-webhook`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ callback_query: { id: 'x', from: { id: fromId }, data: 'approve_4' } }),
});
r = await cb(1003);
check('чужое нажатие «одобрить» отклоняется', r.status === 403, r.status);
check('статус заявки не изменился', (await q('SELECT approval_status FROM users WHERE id = 4'))[0].approval_status === 'pending');

// --- Страницы правил
for (const path of ['/legal/privacy-policy.html', '/legal/marketing-consent.html', '/legal/prize-rules.html', '/legal/terms.html']) {
  const page = await get(path);
  check(`${path} опубликована с реквизитами оператора`, page.status === 200 && page.text.includes('ООО Тест'), page.status);
}
const rules = await get('/legal/prize-rules.html');
check('в правилах акции срок заморозки из настроек', rules.text.includes('через 30 дней'));

await finish();
