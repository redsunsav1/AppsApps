// Общее для сквозных проверок: подпись initData тем же токеном бота, что у тестового
// сервера, запросы к нему и прямой доступ к тестовой базе.
import crypto from 'crypto';
import pg from 'pg';

export const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:18090';
const BOT_TOKEN = process.env.TEST_BOT_TOKEN || '123:test';

export const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
await db.connect();
export const q = async (sql, args) => (await db.query(sql, args)).rows;

export function sign(telegramId) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: telegramId, first_name: 'T' }) });
  const s = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const key = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', key).update(s).digest('hex'));
  return p.toString();
}

export async function post(path, telegramId, body = {}, method = 'POST') {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(telegramId ? { initData: sign(telegramId) } : {}), ...body }),
  });
  let data; try { data = await r.json(); } catch { data = null; }
  return { status: r.status, data };
}

export async function get(path, telegramId) {
  const r = await fetch(BASE + path, { headers: telegramId ? { 'x-init-data': sign(telegramId) } : {} });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, text };
}

let fails = 0;
export function check(name, cond, extra) {
  console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : '  → ' + JSON.stringify(extra)}`);
  if (!cond) fails++;
}

export async function finish() {
  await db.end();
  console.log(fails ? `\n${fails} проверок не прошло` : '\nВсе проверки прошли');
  process.exit(fails ? 1 : 0);
}
