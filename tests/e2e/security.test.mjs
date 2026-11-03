// Защита от злоумышленника с обычным аккаунтом мессенджера: скрипт вместо аватарки,
// серебро до одобрения, подбор кода привязки. Идёт после access.test.mjs.
import { q, get, post, check, finish } from './helpers.mjs';

// --- Аватарка: только картинка, а не HTML со скриптом от имени нашего домена
let r = await post('/api/avatar', 1004, { avatarData: 'data:text/html,<script>alert(1)</script>' });
check('аватарку-HTML не принять', r.status === 400, r);
r = await post('/api/avatar', 1004, { avatarData: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
check('аватарку-SVG не принять', r.status === 400, r);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
r = await post('/api/avatar', 1004, { avatarData: png });
check('аватарку-PNG принять', r.status === 200 && r.data?.avatar_url, r);
let img = await fetch(new URL(r.data.avatar_url, process.env.TEST_BASE_URL || 'http://127.0.0.1:18090'));
check('аватарка отдаётся как картинка в песочнице',
  img.status === 200 && img.headers.get('content-type') === 'image/png' && /sandbox/.test(img.headers.get('content-security-policy') || ''),
  [img.status, img.headers.get('content-type')]);
// Запись, оставшаяся с тех времён, когда загрузку не проверяли
await q("UPDATE users SET avatar_url = 'data:text/html,<script>alert(1)</script>' WHERE id = 4");
img = await fetch(new URL(r.data.avatar_url, process.env.TEST_BASE_URL || 'http://127.0.0.1:18090'));
check('старую HTML-аватарку сервер не отдаёт', img.status === 404, img.status);
await q("UPDATE users SET avatar_url = 'https://evil.example/' WHERE id = 4");
img = await fetch(new URL(r.data.avatar_url, process.env.TEST_BASE_URL || 'http://127.0.0.1:18090'), { redirect: 'manual' });
check('аватарка не перенаправляет на чужой сайт', img.status === 404, img.status);

// --- Серебро за задания — только после одобрения, и один раз в день даже при залпе
const share = (await q("SELECT * FROM quests WHERE type = 'SHARE'"))[0];
const balance = async (uid) => (await q('SELECT balance FROM users WHERE id = $1', [uid]))[0].balance;
r = await post('/api/quests/claim', 1004, { questId: share.id });
check('до одобрения задание серебра не даёт', r.status === 403 && (await balance(4)) === 0, { r, b: await balance(4) });
await q('DELETE FROM quest_completions WHERE user_id = 2');
const b0 = await balance(2);
const burst = await Promise.all([1, 2, 3, 4, 5].map(() => post('/api/quests/claim', 1002, { questId: share.id })));
check('залп нажатий засчитывает задание один раз',
  burst.filter((x) => x.status === 200).length === 1 && (await balance(2)) === b0 + share.reward_amount,
  { statuses: burst.map((x) => x.status), b: await balance(2) });

// --- Код привязки: подбор упирается в лимит неверных попыток
const { data: issued } = await post('/api/link/code', 1003);
const wrong = issued.code === '111111' ? '222222' : '111111';
const tries = [];
for (let i = 0; i < 6; i++) tries.push((await post('/api/link/redeem', 1004, { code: wrong })).status);
check('после 5 неверных кодов привязка закрыта', tries.slice(0, 5).every((s) => s === 400) && tries[5] === 429, tries);
r = await post('/api/link/redeem', 1004, { code: issued.code });
check('и верный код в это время не проходит', r.status === 429, r);

// --- Имя с «&» и «<» не ломает заявку
await post('/api/auth', 2002);
r = await post('/api/register', 2002, { firstName: 'Ира & <b>', lastName: 'Ли', company: 'АН Дом & Ко', companyType: { x: 1 }, phone: '+79990002002', consentPd: true });
const reg = (await q('SELECT first_name, company, company_type FROM users WHERE telegram_id = 2002'))[0];
check('регистрация с «&» и «<» проходит, тип агентства только из списка',
  r.status === 200 && reg?.company === 'АН Дом & Ко' && reg?.company_type === 'agency', { r, reg });

// --- Проверка базы: видит только админ, ловит дубль телефона и золото без сделок
r = await post('/api/admin/users/audit', 1002);
check('проверку базы партнёр не видит', r.status === 403, r.status);
// Одобренным двоим один номер не даст уникальный индекс, а заявке в ожидании — даст.
const veraPhone = (await q('SELECT phone, phone_normalized FROM users WHERE id = 4'))[0];
await q(`UPDATE users SET phone = '+7 999 000-00-02', phone_normalized = '79990000002' WHERE id = 4`);
r = await post('/api/admin/users/audit', 1001);
const section = (key) => r.data?.sections?.find((s) => s.key === key);
check('проверка базы находит один телефон у двух аккаунтов',
  section('dup_phone')?.groups.some((g) => g.map((u) => u.id).sort().join() === '2,4'), r.data);
check('проверка базы показывает админа в правах сотрудника', section('staff')?.groups.some((g) => g[0].id === 1), section('staff'));
check('в проверке базы нет telegram_id', !JSON.stringify(r.data).includes('telegram_id'), null);
await q('UPDATE users SET phone = $1, phone_normalized = $2 WHERE id = 4', [veraPhone.phone, veraPhone.phone_normalized]);

await finish();
