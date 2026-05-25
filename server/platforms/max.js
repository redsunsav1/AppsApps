// =============================================
// MAX Messenger Platform Adapter
// =============================================
// Изолированный модуль для интеграции с мессенджером MAX (VK).
// Документация: https://dev.max.ru/docs-api
//
// Активируется через env: MAX_ENABLED=true
// Если флаг выключен — все функции возвращают безопасные значения,
// существующий Telegram-флоу не затрагивается.
//
// Env-переменные (всё опционально, кроме MAX_BOT_TOKEN если MAX_ENABLED=true):
//   MAX_ENABLED          — 'true' чтобы включить MAX-платформу
//   MAX_BOT_TOKEN        — токен бота из кабинета partners.max.ru
//   ADMIN_MAX_ID         — chat_id админа в MAX для нотификаций
//   MAX_WEBHOOK_URL      — публичный URL (https) для регистрации webhook
//                          по умолчанию используется WEBHOOK_URL (общий)
//   MAX_API_BASE         — кастомный API endpoint (по умолчанию официальный)
//   MAX_TRUST_INIT_DATA  — 'true' для dev-режима без HMAC валидации
//                          (использовать ТОЛЬКО при отладке, на проде = false)

import crypto from 'crypto';

const API_BASE = process.env.MAX_API_BASE || 'https://platform-api.max.ru';

export function isMaxEnabled() {
  return process.env.MAX_ENABLED === 'true';
}

function getToken() {
  return process.env.MAX_BOT_TOKEN || '';
}

// =============================================
// HMAC-валидация MAX initData
// =============================================
// Точный формат подписи initData в публичной документации MAX
// не специфицирован детально. Здесь реализованы две схемы:
//   1. Telegram-совместимая (наиболее вероятная) — приоритетная
//   2. Прямая HMAC от bot_token (fallback)
// Если на проде MAX вернёт другой формат — поправить только эту функцию.
export function validateMaxInitData(initData) {
  const token = getToken();
  if (!token || !initData) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash') || urlParams.get('sign') || urlParams.get('signature');
    if (!hash) return null;

    // Убираем подпись из строки
    urlParams.delete('hash');
    urlParams.delete('sign');
    urlParams.delete('signature');

    const pairs = [];
    for (const [k, v] of urlParams.entries()) pairs.push(`${k}=${v}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    // Схема 1: Telegram-совместимая (HMAC-SHA256 с derived key)
    const secretKey1 = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const checkHash1 = crypto.createHmac('sha256', secretKey1).update(dataCheckString).digest('hex');

    // Схема 2: прямая HMAC от токена
    const checkHash2 = crypto.createHmac('sha256', token).update(dataCheckString).digest('hex');

    if (checkHash1 !== hash && checkHash2 !== hash) return null;

    return parseMaxUser(urlParams);
  } catch (e) {
    console.error('[MAX] HMAC validation error:', e.message);
    return null;
  }
}

// Извлечение данных пользователя из initData
function parseMaxUser(urlParams) {
  // Возможные форматы: user=<JSON> | user_id=123 | id=123
  const userStr = urlParams.get('user');
  if (userStr) {
    try {
      const u = JSON.parse(userStr);
      return normalizeUser(u);
    } catch {}
  }
  const userId = urlParams.get('user_id') || urlParams.get('id');
  if (userId) {
    return {
      id: Number(userId),
      first_name: urlParams.get('first_name') || urlParams.get('name') || '',
      last_name: urlParams.get('last_name') || '',
      username: urlParams.get('username') || '',
    };
  }
  return null;
}

function normalizeUser(u) {
  if (!u) return null;
  return {
    id: Number(u.id || u.user_id),
    first_name: u.first_name || u.name || '',
    last_name: u.last_name || '',
    username: u.username || '',
  };
}

// Парсинг для dev-режима (без HMAC, только для отладки)
export function parseMaxUserDev(initData) {
  if (!initData) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    return parseMaxUser(urlParams);
  } catch {
    return null;
  }
}

// Универсальный парсер: на проде с валидацией, в dev без
export function parseMaxInitData(initData) {
  if (process.env.MAX_TRUST_INIT_DATA === 'true') {
    console.warn('[MAX] ⚠️ MAX_TRUST_INIT_DATA=true — валидация отключена (dev-режим)');
    return parseMaxUserDev(initData);
  }
  return validateMaxInitData(initData);
}

// =============================================
// MAX Bot API — отправка сообщений
// =============================================
// POST {API_BASE}/messages
// Headers: Authorization: <token>
// Body: { recipient: { chat_id | user_id }, text, ... }
async function maxApiCall(method, path, body) {
  const token = getToken();
  if (!token) return { ok: false, error: 'MAX_BOT_TOKEN не задан' };

  try {
    const url = `${API_BASE}${path}`;
    const resp = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      console.error(`[MAX API] ${method} ${path} → HTTP ${resp.status}:`, data);
      return { ok: false, status: resp.status, error: data.message || data.error || text, data };
    }
    return { ok: true, data };
  } catch (e) {
    console.error(`[MAX API] ${method} ${path} → exception:`, e.message);
    return { ok: false, error: e.message };
  }
}

// Отправка сообщения пользователю или в чат
// recipientId — MAX user_id (число)
export async function sendMaxMessage(recipientId, text, attachments) {
  if (!isMaxEnabled()) return { ok: false, error: 'MAX не активен (MAX_ENABLED!=true)' };
  if (!recipientId) return { ok: false, error: 'recipientId пустой' };

  const body = {
    text,
    recipient: { user_id: Number(recipientId) },
  };
  if (attachments && attachments.length) body.attachments = attachments;

  console.log(`[MAX] 📤 → user ${recipientId}: ${text.slice(0, 80)}...`);
  const result = await maxApiCall('POST', '/messages', body);
  if (result.ok) console.log(`[MAX] ✅ delivered to ${recipientId}`);
  return result;
}

export async function notifyAdminMax(text) {
  const adminId = process.env.ADMIN_MAX_ID;
  if (!adminId) {
    console.warn('[MAX] ADMIN_MAX_ID не задан, уведомление админу не отправлено');
    return { ok: false, error: 'no ADMIN_MAX_ID' };
  }
  return sendMaxMessage(adminId, text);
}

// =============================================
// Регистрация webhook
// =============================================
// POST {API_BASE}/subscriptions
// Body: { url: "https://yourdomain.com/api/max-webhook" }
export async function registerMaxWebhook() {
  if (!isMaxEnabled()) return;
  const baseUrl = process.env.MAX_WEBHOOK_URL || process.env.WEBHOOK_URL;
  if (!baseUrl) {
    console.warn('[MAX] WEBHOOK_URL/MAX_WEBHOOK_URL не задан — webhook не зарегистрирован');
    return;
  }
  const fullUrl = `${baseUrl.replace(/\/$/, '')}/api/max-webhook`;
  const result = await maxApiCall('POST', '/subscriptions', { url: fullUrl });
  console.log('[MAX] 🔗 webhook:', result.ok ? `registered → ${fullUrl}` : result.error);
  return result;
}

// =============================================
// Helper: безопасный no-op для случая отключённого MAX
// =============================================
export const MAX_DISABLED_RESPONSE = {
  ok: false,
  error: 'MAX platform не активирован. Установите MAX_ENABLED=true.',
};
