// Журнал золота. Каждая монета — отдельная строка: откуда пришла (сделка, миссия,
// возврат заявки) и куда ушла (заявка на приз). Баланс в users.gold_balance — лишь
// кэш суммы журнала для экранов; решения (можно ли купить приз) принимаются по журналу.
//
// Заморозка: золото за сделку становится доступным не сразу, а через GOLD_HOLD_DAYS.
// Если сделка развалится, его снимут до того, как оно превратится в приз.
// available_at = NULL — заморожено бессрочно, до ручной проверки админом
// (так помечен весь баланс, накопленный до появления журнала).

export const GOLD_HOLD_DAYS = Math.max(0, parseInt(process.env.GOLD_HOLD_DAYS || '30', 10) || 0);

export async function ensureGoldSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS gold_ledger (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    delta INT NOT NULL,
    reason TEXT NOT NULL,
    booking_id INT,
    order_id INT,
    mission_code TEXT,
    amocrm_lead_id TEXT,
    actor_user_id INT,
    note TEXT,
    available_at TIMESTAMP,
    voided_at TIMESTAMP,
    voided_by INT,
    void_note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );`);
  await db.query('CREATE INDEX IF NOT EXISTS gold_ledger_user_idx ON gold_ledger (user_id);');

  // Баланс до журнала происхождения не имеет: квест «Продать квартиру» раздавал
  // золото по нажатию кнопки. Переносим его замороженным — тратить можно только
  // после того, как админ посмотрит историю партнёра и разморозит.
  await db.query(`
    INSERT INTO gold_ledger (user_id, delta, reason, note, available_at)
    SELECT u.id, u.gold_balance, 'legacy', 'Баланс до запуска журнала золота — требует проверки', NULL
    FROM users u
    WHERE COALESCE(u.gold_balance, 0) <> 0
      AND NOT EXISTS (SELECT 1 FROM gold_ledger g WHERE g.user_id = u.id)
  `);
}

// Записать движение золота и обновить кэш баланса. Вызывать внутри транзакции.
export async function addGold(client, {
  userId, delta, reason, bookingId = null, orderId = null, missionCode = null,
  leadId = null, actorUserId = null, note = null, hold = false, frozen = false,
}) {
  const availableAt = frozen ? null
    : hold ? new Date(Date.now() + GOLD_HOLD_DAYS * 86400000)
    : new Date();
  const res = await client.query(`
    INSERT INTO gold_ledger (user_id, delta, reason, booking_id, order_id, mission_code, amocrm_lead_id, actor_user_id, note, available_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
  `, [userId, delta, reason, bookingId, orderId, missionCode, leadId ? String(leadId) : null, actorUserId, note, availableAt]);
  await client.query('UPDATE users SET gold_balance = COALESCE(gold_balance, 0) + $1 WHERE id = $2', [delta, userId]);
  return res.rows[0];
}

// Аннулировать запись: она остаётся в истории, но перестаёт считаться.
export async function voidGoldEntry(client, entryId, { actorUserId = null, note = null } = {}) {
  const res = await client.query(`
    UPDATE gold_ledger SET voided_at = NOW(), voided_by = $2, void_note = $3
    WHERE id = $1 AND voided_at IS NULL RETURNING *
  `, [entryId, actorUserId, note]);
  const entry = res.rows[0];
  if (entry) {
    await client.query('UPDATE users SET gold_balance = COALESCE(gold_balance, 0) - $1 WHERE id = $2', [entry.delta, entry.user_id]);
  }
  return entry || null;
}

// Сколько золота у партнёра всего и сколько можно потратить прямо сейчас.
// Списания учитываются сразу, начисления — только когда наступил available_at.
export async function goldSummary(db, userId) {
  const res = await db.query(`
    SELECT
      COALESCE(SUM(delta), 0)::int AS total,
      COALESCE(SUM(delta) FILTER (WHERE delta < 0 OR available_at <= NOW()), 0)::int AS available,
      COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND available_at IS NULL), 0)::int AS on_review,
      MIN(available_at) FILTER (WHERE delta > 0 AND available_at > NOW()) AS next_unlock_at
    FROM gold_ledger WHERE user_id = $1 AND voided_at IS NULL
  `, [userId]);
  const row = res.rows[0];
  return {
    total: row.total,
    available: row.available,
    onReview: row.on_review,
    held: row.total - row.available - row.on_review,
    nextUnlockAt: row.next_unlock_at,
  };
}

export async function goldHistory(db, userId) {
  const res = await db.query(`
    SELECT g.*, b.unit_id, u.number AS unit_number, p.title AS product_title
    FROM gold_ledger g
    LEFT JOIN bookings b ON b.id = g.booking_id
    LEFT JOIN units u ON u.id = b.unit_id
    LEFT JOIN orders o ON o.id = g.order_id
    LEFT JOIN products p ON p.id = o.product_id
    WHERE g.user_id = $1
    ORDER BY g.created_at DESC, g.id DESC
  `, [userId]);
  return res.rows;
}
