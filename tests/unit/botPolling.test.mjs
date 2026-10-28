// Опрос Telegram и MAX на подставных ответах: снятие вебхука, порядок и смещение
// обновлений, переживание 409 Conflict и ошибок сети.
import { createPollingStatus, startTelegramPolling, startMaxPolling } from '../../server/botPolling.js';

let fails = 0;
const check = (n, c, x) => { console.log(`${c ? '✅' : '❌'} ${n}${c ? '' : ' → ' + JSON.stringify(x)}`); if (!c) fails++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Telegram
const calls = [];
let getUpdatesN = 0;
globalThis.fetch = async (url, opts) => {
  const method = url.split('/').pop();
  const body = JSON.parse(opts.body || '{}');
  calls.push({ method, body });
  if (method === 'deleteWebhook') return { json: async () => ({ ok: true }) };
  getUpdatesN++;
  if (getUpdatesN === 1) return { json: async () => ({ ok: true, result: [{ update_id: 10, message: { text: '/start' } }, { update_id: 11, message: { text: 'hi' } }] }) };
  if (getUpdatesN === 2) throw new Error('network down');
  if (getUpdatesN === 3) return { json: async () => ({ ok: false, error_code: 409, description: 'Conflict' }) };
  if (getUpdatesN === 4) return { json: async () => ({ ok: true, result: [{ update_id: 12, callback_query: {} }] }) };
  await wait(60000);
};
const seen = [];
const tg = createPollingStatus();
startTelegramPolling({ token: 'x', status: tg, onUpdate: async (u) => { seen.push(u.update_id); if (u.update_id === 11) throw new Error('boom'); } });
await wait(9000);
check('перед опросом снимается вебхук без потери очереди', calls[0].method === 'deleteWebhook' && calls[0].body.drop_pending_updates === false, calls[0]);
check('обновления обработаны по порядку, ошибка в одном не мешает другим', JSON.stringify(seen) === '[10,11,12]', seen);
const offsets = calls.filter((c) => c.method === 'getUpdates').map((c) => c.body.offset);
check('смещение сдвигается после обработки', offsets[0] === 0 && offsets[1] === 12 && offsets[3] === 12, offsets);
check('после сбоя сети и 409 опрос продолжается, ошибка видна в статусе', getUpdatesN >= 4 && tg.handled === 3 && /409/.test(tg.lastError || ''), tg);

// --- MAX
const maxCalls = [];
let updatesN = 0;
const apiCall = async (method, path) => {
  maxCalls.push(`${method} ${path}`);
  if (path === '/subscriptions' && method === 'GET') return { ok: true, data: { subscriptions: [{ url: 'https://old.example/api/max-webhook' }] } };
  if (method === 'DELETE') return { ok: true, data: {} };
  updatesN++;
  if (updatesN === 1) return { ok: true, data: { updates: [{ update_type: 'bot_started' }], marker: 77 } };
  await wait(60000);
};
const maxSeen = [];
const mx = createPollingStatus();
startMaxPolling({ apiCall, status: mx, onUpdate: async (u) => maxSeen.push(u.update_type) });
await wait(300);
check('старая подписка-вебхук MAX снимается', maxCalls.includes('DELETE /subscriptions?url=https%3A%2F%2Fold.example%2Fapi%2Fmax-webhook'), maxCalls);
check('обновление MAX обработано, маркер передаётся дальше', maxSeen[0] === 'bot_started' && maxCalls.some((c) => c.includes('marker=77')), maxCalls);

console.log(fails ? `${fails} не прошло` : 'Все проверки прошли');
process.exit(fails ? 1 : 0);
