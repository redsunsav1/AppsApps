// Проверка базы партнёров перед тем, как пускать людей: дубли, чужие права,
// странные анкеты. Смотрим только одобренных и ожидающих — отклонённые и
// слитые при привязке мессенджеров уже никуда не пускают.

const ACTIVE = `merged_into_user_id IS NULL AND approval_status IN ('approved', 'pending')`;
const FIELDS = `id, first_name, last_name, company, phone, platform, approval_status,
  is_admin, can_manage_bookings, gold_balance, balance, xp_points, deals_closed, created_at`;
const PENDING_STALE_DAYS = 7;

// Группы с общим ключом: один ключ — одна строка отчёта со всеми совпавшими людьми.
async function groupedBy(pool, keyExpr, extraWhere = '') {
  const r = await pool.query(`
    WITH k AS (SELECT ${FIELDS}, ${keyExpr} AS key FROM users WHERE ${ACTIVE} ${extraWhere})
    SELECT * FROM k WHERE key IN (SELECT key FROM k WHERE key IS NOT NULL GROUP BY key HAVING COUNT(*) > 1)
    ORDER BY key, created_at`);
  const groups = new Map();
  for (const row of r.rows) {
    const { key, ...user } = row;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(user);
  }
  return [...groups.values()];
}

async function listed(pool, where) {
  const r = await pool.query(`SELECT ${FIELDS} FROM users WHERE ${ACTIVE} AND (${where}) ORDER BY created_at`);
  return r.rows.map(u => [u]);
}

// Анкета, на которую стоит посмотреть глазами: пустые поля, цифры или ссылки
// в имени, номер не российского формата.
function oddReasons(u, phoneNormalized) {
  const reasons = [];
  const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
  if (name.length < 2) reasons.push('нет имени');
  if (/\d/.test(name)) reasons.push('цифры в имени');
  if (/(https?:|www\.|@|t\.me)/i.test(`${name} ${u.company || ''}`)) reasons.push('ссылка или @ в анкете');
  if (/[a-z]/i.test(name) && !/[а-яё]/i.test(name)) reasons.push('имя латиницей');
  if (!String(u.company || '').trim()) reasons.push('нет агентства');
  if (!phoneNormalized) reasons.push('нет телефона');
  else if (!/^79\d{9}$/.test(phoneNormalized)) reasons.push('номер не российского мобильного формата');
  return reasons;
}

export async function auditUsers(pool) {
  const sections = [];
  const add = (key, severity, title, hint, groups) => {
    if (groups.length) sections.push({ key, severity, title, hint, groups });
  };

  add('dup_phone', 'high', 'Один телефон — несколько аккаунтов',
    'Обычно это один человек, зашедший из Telegram и MAX. Оставьте одну запись или свяжите аккаунты через привязку.',
    await groupedBy(pool, 'phone_normalized'));

  add('dup_name', 'medium', 'Одинаковые имя и фамилия',
    'Может быть однофамилец, а может быть повторная заявка с другого номера.',
    await groupedBy(pool, `NULLIF(lower(trim(coalesce(first_name, ''))) || ' ' || lower(trim(coalesce(last_name, ''))), ' ')`,
      `AND coalesce(trim(last_name), '') <> ''`));

  add('same_device', 'low', 'Согласие дано с одного IP',
    'В одном офисе это нормально. Подозрительно, если агентства разные, а заявки поданы подряд.',
    await groupedBy(pool, 'consent_pd_ip_hash'));

  add('staff', 'high', 'Права сотрудника застройщика',
    'Админ видит заявки и базу, отдел продаж — все брони. Проверьте, что здесь только ваши люди.',
    await listed(pool, 'is_admin = TRUE OR can_manage_bookings = TRUE'));

  add('balance', 'high', 'Золото без закрытых сделок',
    'Золото даётся только за сделки, подтверждённые отделом продаж.',
    await listed(pool, `coalesce(gold_balance, 0) > 0 AND coalesce(deals_closed, 0) = 0`));

  add('stale_pending', 'low', `Ждут одобрения дольше ${PENDING_STALE_DAYS} дней`,
    'Решите по ним: одобрить или отклонить.',
    await listed(pool, `approval_status = 'pending' AND created_at < NOW() - INTERVAL '${PENDING_STALE_DAYS} days'`));

  add('phone_manual', 'medium', 'Телефон введён вручную',
    'Номер не подтверждён мессенджером — человек мог указать чужой. Перезвоните перед одобрением.',
    await listed(pool, `phone_verified_at IS NULL AND is_admin = FALSE AND coalesce(can_manage_bookings, FALSE) = FALSE`));

  const all = await pool.query(`SELECT ${FIELDS}, phone_normalized FROM users WHERE ${ACTIVE}
    AND is_admin = FALSE AND coalesce(can_manage_bookings, FALSE) = FALSE ORDER BY created_at`);
  const odd = [];
  for (const { phone_normalized, ...u } of all.rows) {
    const reasons = oddReasons(u, phone_normalized);
    if (reasons.length) odd.push([{ ...u, reasons }]);
  }
  add('odd', 'medium', 'Странные анкеты', 'Пустые поля, цифры или ссылки в имени, номер не российского формата.', odd);

  const totals = await pool.query(`SELECT
      COUNT(*) FILTER (WHERE approval_status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE approval_status = 'pending')::int AS pending
    FROM users WHERE merged_into_user_id IS NULL`);
  return { checkedAt: new Date().toISOString(), totals: totals.rows[0], sections };
}
