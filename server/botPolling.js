// Получение сообщений ботов «вытягиванием» (long polling) вместо вебхука.
//
// После переезда Amvera серверы Telegram не могут открыть соединение с нашим
// доменом (getWebhookInfo: «Connection timed out»), а исходящие запросы от нас
// к Telegram и MAX проходят. При polling сервер сам спрашивает у мессенджера
// новые сообщения, поэтому входящие соединения ему не нужны.
//
// Если в один момент работают два экземпляра (выкатка), Telegram отдаёт второму
// 409 Conflict — тот ждёт и пробует снова, сообщения не дублируются.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createPollingStatus() {
  return { mode: 'polling', running: false, lastPollAt: null, lastError: null, lastErrorAt: null, handled: 0 };
}

function noteError(status, message) {
  status.lastError = message;
  status.lastErrorAt = new Date().toISOString();
}

export async function startTelegramPolling({ token, onUpdate, status, allowedUpdates = ['message', 'callback_query'] }) {
  if (!token || status.running) return;
  status.running = true;
  const api = (method, body, timeoutMs = 15000) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(timeoutMs),
  }).then((r) => r.json());

  // Пока стоит вебхук, getUpdates не работает. Накопившиеся сообщения не выбрасываем.
  try {
    const res = await api('deleteWebhook', { drop_pending_updates: false });
    if (!res.ok) noteError(status, `deleteWebhook: ${res.description}`);
  } catch (e) { noteError(status, `deleteWebhook: ${e.message}`); }

  let offset = 0;
  for (;;) {
    try {
      const res = await api('getUpdates', { offset, timeout: 25, allowed_updates: allowedUpdates }, 40000);
      status.lastPollAt = new Date().toISOString();
      if (!res.ok) {
        noteError(status, `getUpdates: ${res.error_code} ${res.description}`);
        await sleep(res.error_code === 409 ? 3000 : 5000);
        continue;
      }
      for (const update of res.result || []) {
        offset = update.update_id + 1;
        status.handled++;
        try { await onUpdate(update); } catch (e) { console.error('[Telegram polling] update error:', e.message); }
      }
    } catch (e) {
      noteError(status, `getUpdates: ${e.message}`);
      await sleep(5000);
    }
  }
}

export async function startMaxPolling({ apiCall, onUpdate, status, types = ['bot_started', 'message_created', 'message_callback'] }) {
  if (status.running) return;
  status.running = true;

  // MAX отдаёт обновления через /updates, только если у бота нет подписок-вебхуков.
  try {
    const subs = await apiCall('GET', '/subscriptions');
    for (const sub of subs.data?.subscriptions || []) {
      const del = await apiCall('DELETE', `/subscriptions?url=${encodeURIComponent(sub.url)}`);
      if (!del.ok) noteError(status, `удаление подписки ${sub.url}: ${del.error}`);
    }
  } catch (e) { noteError(status, `подписки: ${e.message}`); }

  let marker = null;
  for (;;) {
    try {
      const qs = new URLSearchParams({ timeout: '25', limit: '100', types: types.join(',') });
      if (marker != null) qs.set('marker', String(marker));
      const res = await apiCall('GET', `/updates?${qs}`);
      status.lastPollAt = new Date().toISOString();
      if (!res.ok) {
        noteError(status, `updates: ${res.status || ''} ${res.error}`);
        await sleep(5000);
        continue;
      }
      if (res.data?.marker != null) marker = res.data.marker;
      for (const update of res.data?.updates || []) {
        status.handled++;
        try { await onUpdate(update); } catch (e) { console.error('[MAX polling] update error:', e.message); }
      }
    } catch (e) {
      noteError(status, `updates: ${e.message}`);
      await sleep(5000);
    }
  }
}
