import express from 'express';
import compression from 'compression';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';
import cron from 'node-cron';
import multer from 'multer';
import nodemailer from 'nodemailer';

// =============================================
// MAX Messenger Platform Adapter (inline)
// =============================================
// Встроен напрямую в server.js — без отдельного файла-модуля.
// Активируется через env: MAX_ENABLED=true + MAX_BOT_TOKEN=<token>

const MAX_API_BASE = process.env.MAX_API_BASE || 'https://platform-api.max.ru';

function isMaxEnabled() {
  return process.env.MAX_ENABLED === 'true';
}

function _maxGetToken() {
  return process.env.MAX_BOT_TOKEN || '';
}

function _maxValidateInitData(initData) {
  const token = _maxGetToken();
  if (!token || !initData) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash') || urlParams.get('sign') || urlParams.get('signature');
    if (!hash) return null;
    urlParams.delete('hash'); urlParams.delete('sign'); urlParams.delete('signature');
    const pairs = [];
    for (const [k, v] of urlParams.entries()) pairs.push(`${k}=${v}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');
    const secretKey1 = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const checkHash1 = crypto.createHmac('sha256', secretKey1).update(dataCheckString).digest('hex');
    const checkHash2 = crypto.createHmac('sha256', token).update(dataCheckString).digest('hex');
    if (checkHash1 !== hash && checkHash2 !== hash) return null;
    const userStr = urlParams.get('user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        return { id: Number(u.id || u.user_id), first_name: u.first_name || u.name || '', last_name: u.last_name || '', username: u.username || '' };
      } catch {}
    }
    const userId = urlParams.get('user_id') || urlParams.get('id');
    if (userId) return { id: Number(userId), first_name: urlParams.get('first_name') || '', last_name: urlParams.get('last_name') || '', username: urlParams.get('username') || '' };
    return null;
  } catch (e) {
    console.error('[MAX] HMAC validation error:', e.message);
    return null;
  }
}

function parseMaxInitData(initData) {
  if (!initData) return null;
  if (process.env.MAX_TRUST_INIT_DATA === 'true') {
    console.warn('[MAX] ⚠️ MAX_TRUST_INIT_DATA=true — валидация отключена (dev-режим)');
    try {
      const urlParams = new URLSearchParams(initData);
      const userStr = urlParams.get('user');
      if (userStr) { const u = JSON.parse(userStr); return { id: Number(u.id || u.user_id), first_name: u.first_name || u.name || '', last_name: u.last_name || '', username: u.username || '' }; }
      const userId = urlParams.get('user_id') || urlParams.get('id');
      if (userId) return { id: Number(userId), first_name: urlParams.get('first_name') || '', last_name: '', username: '' };
    } catch {}
    return null;
  }
  return _maxValidateInitData(initData);
}

async function _maxApiCall(method, path2, body) {
  const token = _maxGetToken();
  if (!token) return { ok: false, error: 'MAX_BOT_TOKEN не задан' };
  try {
    const resp = await fetch(`${MAX_API_BASE}${path2}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await resp.text();
    let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!resp.ok) { console.error(`[MAX API] ${method} ${path2} → HTTP ${resp.status}:`, data); return { ok: false, status: resp.status, error: data.message || data.error || text, data }; }
    return { ok: true, data };
  } catch (e) {
    console.error(`[MAX API] ${method} ${path2} → exception:`, e.message);
    return { ok: false, error: e.message };
  }
}

async function sendMaxMessage(recipientId, text, attachments) {
  if (!isMaxEnabled()) return { ok: false, error: 'MAX не активен' };
  if (!recipientId) return { ok: false, error: 'recipientId пустой' };
  const body = { text };
  if (/<\/?[a-z][\s\S]*>/i.test(String(text))) body.format = 'html';
  if (attachments && attachments.length) body.attachments = attachments;
  console.log(`[MAX] 📤 → user ${recipientId}: ${String(text).slice(0, 80)}`);
  const result = await _maxApiCall('POST', `/messages?user_id=${encodeURIComponent(String(recipientId))}`, body);
  if (result.ok) console.log(`[MAX] ✅ delivered to ${recipientId}`);
  return result;
}

async function notifyAdminMax(text, inlineKeyboard) {
  const adminId = process.env.ADMIN_MAX_ID;
  if (!adminId) { console.warn('[MAX] ADMIN_MAX_ID не задан'); return { ok: false, error: 'no ADMIN_MAX_ID' }; }
  return sendMaxMessage(adminId, text, buildMaxInlineKeyboard(inlineKeyboard));
}

async function registerMaxWebhook() {
  if (!isMaxEnabled()) return;
  const baseUrl = process.env.MAX_WEBHOOK_URL || process.env.WEBHOOK_URL;
  if (!baseUrl) { console.warn('[MAX] WEBHOOK_URL не задан — webhook не зарегистрирован'); return; }
  const fullUrl = `${baseUrl.replace(/\/$/, '')}/api/max-webhook`;
  const body = {
    url: fullUrl,
    update_types: ['bot_started', 'message_created', 'message_callback'],
  };
  if (process.env.MAX_WEBHOOK_SECRET) body.secret = process.env.MAX_WEBHOOK_SECRET;
  const result = await _maxApiCall('POST', '/subscriptions', body);
  console.log('[MAX] 🔗 webhook:', result.ok ? `registered → ${fullUrl}` : result.error);
  return result;
}

function getMaxMiniAppLink() {
  const botName = process.env.MAX_BOT_USERNAME || process.env.MAX_BOT_NAME || 'id301904538307_bot';
  return `https://max.ru/${botName}?startapp`;
}

function getAppUrl() {
  return process.env.APP_URL || process.env.WEBAPP_URL || process.env.WEBHOOK_URL || 'https://partnerbuild.ru';
}

function getAppOpenKeyboard() {
  return [[{ text: 'Открыть приложение', url: getAppUrl() }]];
}

function buildMaxStartKeyboard() {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: [[
        { type: 'open_app', text: 'Открыть приложение', web_app: getMaxMiniAppLink() },
      ], [
        { type: 'link', text: 'Открыть по ссылке', url: getMaxMiniAppLink() },
      ]],
    },
  }];
}

function buildMaxInlineKeyboard(inlineKeyboard) {
  if (!inlineKeyboard || !Array.isArray(inlineKeyboard)) return undefined;
  const buttons = inlineKeyboard
    .map(row => (Array.isArray(row) ? row : []).map(button => {
      if (button.callback_data) {
        return { type: 'callback', text: button.text, payload: button.callback_data };
      }
      if (button.url) {
        return { type: 'link', text: button.text, url: button.url };
      }
      if (button.web_app) {
        return { type: 'open_app', text: button.text, web_app: button.web_app.url || button.web_app };
      }
      return null;
    }).filter(Boolean))
    .filter(row => row.length > 0);
  if (!buttons.length) return undefined;
  return [{ type: 'inline_keyboard', payload: { buttons } }];
}

function getMaxUpdateUserId(update) {
  return update?.user?.user_id
    || update?.user?.id
    || update?.message?.sender?.user_id
    || update?.message?.sender?.id
    || update?.message?.from?.user_id
    || update?.message?.from?.id
    || update?.chat_id;
}

function getMaxUpdateText(update) {
  return String(update?.message?.body?.text || update?.message?.text || update?.text || '').trim();
}

function getMaxCallbackPayload(update) {
  return update?.callback?.payload
    || update?.callback?.button?.payload
    || update?.callback?.data
    || update?.message?.callback?.payload
    || update?.message?.body?.payload
    || update?.payload
    || '';
}

function getMaxCallbackId(update) {
  return update?.callback?.callback_id
    || update?.callback_id
    || update?.message?.callback?.callback_id
    || '';
}

function getMaxMessageText(update) {
  return String(update?.message?.body?.text || update?.message?.text || '').trim();
}

async function answerMaxCallback(callbackId, notification, messageText) {
  if (!callbackId) return { ok: false, error: 'no callback_id' };
  const body = { notification };
  if (messageText) {
    body.message = { text: messageText, format: 'html', attachments: [] };
  }
  return _maxApiCall('POST', `/answers?callback_id=${encodeURIComponent(String(callbackId))}`, body);
}

console.log(isMaxEnabled() ? '🟣 MAX platform ENABLED' : '⚪ MAX platform disabled (set MAX_ENABLED=true to enable)');

// Поддержка обоих имён переменной (TELEGRAM_BOT_TOKEN в Amvera, BOT_TOKEN в коде)
if (!process.env.BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN) {
  process.env.BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Pool } = pg;

// Доверяем reverse proxy Amvera — req.ip берётся из X-Forwarded-For,
// иначе все клиенты за прокси выглядят как один IP и попадают в общий rate-limit
app.set('trust proxy', true);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// CORS: по умолчанию разрешаем только собственные домены приложения и локальную разработку.
const DEFAULT_ALLOWED_ORIGINS = [
  'https://partnerbuild.ru',
  'https://web.telegram.org',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
for (const envUrl of [process.env.APP_URL, process.env.WEBAPP_URL, process.env.WEBHOOK_URL, process.env.MAX_WEBHOOK_URL]) {
  if (envUrl) DEFAULT_ALLOWED_ORIGINS.push(envUrl.replace(/\/$/, ''));
}
const ALLOWED_ORIGINS = [
  ...DEFAULT_ALLOWED_ORIGINS,
  ...(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
];
const allowedOriginsSet = new Set(ALLOWED_ORIGINS);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOriginsSet.has(origin)) return cb(null, true);
    return cb(null, false);
  },
}));

app.use(compression({ level: 6 }));
app.use(express.json({ limit: '5mb' }));
// Статика: кэш 7 дней для ассетов, 0 для index.html (всегда свежий)
app.use(express.static(path.join(__dirname, 'dist'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// Rate limiting (in-memory)
const rlMap = new Map();
function rateLimit(windowMs, maxReq) {
  return (req, res, next) => {
    const key = (req.ip || '0') + req.path;
    const now = Date.now();
    let e = rlMap.get(key);
    if (!e || now - e.s > windowMs) { e = { s: now, c: 0 }; rlMap.set(key, e); }
    e.c++;
    if (e.c > maxReq) return res.status(429).json({ error: 'Слишком много запросов' });
    next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rlMap) { if (now - v.s > 900000) rlMap.delete(k); } }, 900000);

// PostgreSQL Pool
const PG_POOL_MAX = Math.max(2, parseInt(process.env.PG_POOL_MAX || '15', 10) || 15);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: PG_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (err) => console.error('⚠️ Pool error:', err.message));

// Transaction helper
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// =============================================
// HMAC-валидация Telegram initData
// =============================================
function validateTelegramData(initData) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN || !initData) return null;
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');
    const dataCheckArr = [];
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const checkHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (checkHash !== hash) return null;
    const userStr = urlParams.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch (e) {
    console.error('HMAC validation error:', e.message);
    return null;
  }
}

function parseTelegramUser(initData) {
  if (process.env.BOT_TOKEN) return validateTelegramData(initData);
  console.warn('⚠️ BOT_TOKEN не задан! Валидация initData отключена (dev-режим)');
  try {
    const urlParams = new URLSearchParams(initData);
    return JSON.parse(urlParams.get('user'));
  } catch (e) { return null; }
}

// Универсальная авторизация: Telegram initData ИЛИ MAX initData ИЛИ PWA-токен
// ВАЖНО: Telegram-путь не изменён, MAX и PWA — fallback после него.
// Возвращает: { id, username, first_name, _platform: 'telegram'|'max'|'pwa' }
async function resolveAuth(initDataOrToken, platformHint) {
  if (!initDataOrToken) return null;

  // 1. Telegram initData (как раньше — приоритет, ничего не сломалось)
  if (platformHint !== 'max') {
    const tgUser = parseTelegramUser(initDataOrToken);
    if (tgUser) return { ...tgUser, _platform: 'telegram' };
  }

  // 2. MAX initData (только если платформа активирована)
  if (isMaxEnabled() && platformHint !== 'telegram') {
    const maxUser = parseMaxInitData(initDataOrToken);
    if (maxUser) {
      // Для MAX-юзера ищем/создаём запись в users по max_id
      try {
        const res = await pool.query('SELECT * FROM users WHERE max_id = $1', [maxUser.id]);
        if (res.rows.length > 0) {
          const u = res.rows[0];
          return {
            id: u.max_id,
            username: u.username,
            first_name: u.first_name,
            _platform: 'max',
            _dbId: u.id,
          };
        }
      } catch (e) {
        console.error('resolveAuth max lookup error:', e.message);
      }
      // Юзер прошёл подпись, но в БД его ещё нет — возвращаем как нового
      return { ...maxUser, _platform: 'max', _isNew: true };
    }
  }

  // 3. PWA-токен (как раньше)
  try {
    const res = await pool.query('SELECT * FROM users WHERE pwa_token = $1', [initDataOrToken]);
    if (res.rows.length > 0) {
      const user = res.rows[0];
      return {
        id: user.telegram_id || user.max_id,
        username: user.username,
        first_name: user.first_name,
        _platform: user.platform || (user.telegram_id ? 'telegram' : 'max'),
        _dbId: user.id,
      };
    }
  } catch (e) {
    console.error('resolveAuth pwa_token error:', e.message);
  }
  return null;
}

// Универсальный резолвер: всегда возвращает полную строку из таблицы users + _platform.
// Работает для Telegram initData, MAX initData, MAX URL-hash и PWA-токена.
async function resolveDbUser(initData, platformHint) {
  const auth = await resolveAuth(initData, platformHint);
  if (!auth) return null;
  try {
    let r;
    if (auth._dbId) {
      r = await pool.query('SELECT * FROM users WHERE id = $1', [auth._dbId]);
    } else if (auth._platform === 'max') {
      r = await pool.query('SELECT * FROM users WHERE max_id = $1', [auth.id]);
    } else {
      r = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [auth.id]);
    }
    return r.rows.length > 0 ? { ...r.rows[0], _platform: auth._platform } : null;
  } catch (e) {
    console.error('resolveDbUser error:', e.message);
    return null;
  }
}

async function isAdmin(initData) {
  if (!initData) return false;
  try {
    const user = await resolveDbUser(initData);
    return !!user?.is_admin;
  } catch (e) { return false; }
}

async function canManageBookings(initData) {
  if (!initData) return false;
  try {
    const user = await resolveDbUser(initData);
    return !!(user?.is_admin || user?.can_manage_bookings);
  } catch (e) { return false; }
}

async function isAdminRequest(req) {
  const initData = req.body?.initData || req.get('x-init-data') || req.query?.initData || '';
  return isAdmin(typeof initData === 'string' ? initData : '');
}

async function canManageBookingsRequest(req) {
  const initData = req.body?.initData || req.get('x-init-data') || req.query?.initData || '';
  return canManageBookings(typeof initData === 'string' ? initData : '');
}

// =============================================
// EMAIL-СЕРВИС
// =============================================
function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function sendDocumentEmail(subject, files, bookingInfo) {
  const transport = createMailTransport();
  const emailTo = process.env.EMAIL_SALES;
  if (!transport || !emailTo) {
    console.warn('⚠️ Email не настроен (SMTP_HOST/EMAIL_SALES). Документы не отправлены.');
    return false;
  }
  try {
    const attachments = files.map(f => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype }));
    await transport.sendMail({
      from: process.env.SMTP_USER, to: emailTo, subject,
      html: `<h2>${subject}</h2>
        <p><b>Риелтор:</b> ${bookingInfo.agentName} (${bookingInfo.agentCompany})</p>
        <p><b>Телефон риелтора:</b> ${bookingInfo.agentPhone}</p><hr>
        <p><b>Покупатель:</b> ${bookingInfo.buyerName || '—'}</p>
        <p><b>Телефон покупателя:</b> ${bookingInfo.buyerPhone || '—'}</p><hr>
        <p><b>Квартира:</b> №${bookingInfo.unitNumber}, этаж ${bookingInfo.unitFloor}</p>
        <p><b>Проект:</b> ${bookingInfo.projectId}</p>
        <p><b>Цена:</b> ${bookingInfo.unitPrice} ₽</p>`,
      attachments
    });
    console.log('✅ Email sent to', emailTo);
    return true;
  } catch (e) {
    console.error('Email send error:', e.message);
    return false;
  }
}

// =============================================
// TELEGRAM BOT NOTIFICATIONS
// =============================================
async function notifyUserTelegram(telegramId, text, inlineKeyboard) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) { console.warn('⚠️ notifyUser: BOT_TOKEN не задан'); return { ok: false, error: 'no BOT_TOKEN' }; }
  if (!telegramId) { console.warn('⚠️ notifyUser: telegramId пустой'); return { ok: false, error: 'no telegramId' }; }
  try {
    const body = { chat_id: telegramId, text, parse_mode: 'HTML' };
    if (inlineKeyboard) body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    console.log(`📤 Sending notification to ${telegramId}...`);
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    const result = await resp.json();
    if (!result.ok) console.error(`❌ Telegram API error for ${telegramId}:`, result.description || JSON.stringify(result));
    else console.log(`✅ Notification sent to ${telegramId}`);
    return result;
  } catch (e) {
    console.error('Telegram user notify error:', e.message);
    return { ok: false, error: e.message };
  }
}

async function notifyAdminTelegram(text, inlineKeyboard) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const ADMIN_CHAT_ID = process.env.ADMIN_TELEGRAM_ID;
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) { console.warn('⚠️ Telegram уведомление не отправлено'); return; }
  try {
    const body = { chat_id: ADMIN_CHAT_ID, text, parse_mode: 'HTML' };
    if (inlineKeyboard) body.reply_markup = JSON.stringify({ inline_keyboard: inlineKeyboard });
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } catch (e) { console.error('Telegram notify error:', e.message); }
}

// =============================================
// УНИВЕРСАЛЬНЫЕ УВЕДОМЛЕНИЯ (Telegram + MAX)
// =============================================
// Принимает либо объект пользователя из БД (с полями telegram_id, max_id, platform),
// либо просто id одной из платформ. Маршрутизирует уведомление автоматически.
async function notifyUser(userOrId, text, inlineKeyboard) {
  // Если передан примитив — считаем Telegram (обратная совместимость)
  if (typeof userOrId === 'number' || typeof userOrId === 'string') {
    return notifyUserTelegram(userOrId, text, inlineKeyboard);
  }
  if (!userOrId || typeof userOrId !== 'object') {
    return { ok: false, error: 'invalid recipient' };
  }
  const platform = userOrId.platform || (userOrId.telegram_id ? 'telegram' : userOrId.max_id ? 'max' : null);
  if (platform === 'max' && userOrId.max_id) {
    return sendMaxMessage(userOrId.max_id, text, buildMaxInlineKeyboard(inlineKeyboard));
  }
  if (platform === 'telegram' && userOrId.telegram_id) {
    return notifyUserTelegram(userOrId.telegram_id, text, inlineKeyboard);
  }
  // Fallback: пробуем оба, что найдётся
  if (userOrId.telegram_id) return notifyUserTelegram(userOrId.telegram_id, text, inlineKeyboard);
  if (userOrId.max_id) return sendMaxMessage(userOrId.max_id, text, buildMaxInlineKeyboard(inlineKeyboard));
  return { ok: false, error: 'no platform id on user' };
}

async function notifyAdmin(text, inlineKeyboard) {
  // Дублируем уведомление во все настроенные каналы (TG + MAX), не блокируя друг друга
  const results = await Promise.allSettled([
    notifyAdminTelegram(text, inlineKeyboard),
    isMaxEnabled() ? notifyAdminMax(text, inlineKeyboard) : Promise.resolve({ ok: false, skipped: true }),
  ]);
  return results;
}

// =============================================
// WEBHOOK REGISTRATION
// =============================================
async function registerWebhook() {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  const WEBHOOK_URL = process.env.WEBHOOK_URL;
  if (!BOT_TOKEN || !WEBHOOK_URL) { console.warn('⚠️ WEBHOOK_URL не задан, webhook не зарегистрирован'); return; }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${WEBHOOK_URL}/api/telegram-webhook` })
    });
    const result = await resp.json();
    console.log('🔗 Webhook:', result.ok ? 'registered' : result.description);
  } catch (e) { console.error('Webhook error:', e.message); }
}

// =============================================
// ИНИЦИАЛИЗАЦИЯ БД
// =============================================
const initDb = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to Database (Pool)');

    // --- Таблицы ---
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username TEXT, first_name TEXT, balance INT DEFAULT 0, phone TEXT, company TEXT, is_registered BOOLEAN DEFAULT FALSE, is_admin BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, image_url TEXT, project_name TEXT, progress INT DEFAULT 0, checklist JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, floors INT DEFAULT 1, units_per_floor INT DEFAULT 4, image_url TEXT, feed_url TEXT);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, project_id TEXT, floor INT, number TEXT, rooms INT, area NUMERIC, price NUMERIC, status TEXT, plan_image_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, title TEXT NOT NULL, price INT NOT NULL, currency TEXT DEFAULT 'SILVER', image_url TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INT, product_id INT, price INT, currency TEXT, status TEXT DEFAULT 'NEW', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS quests (id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, reward_xp INT DEFAULT 0, reward_amount INT DEFAULT 0, reward_currency TEXT DEFAULT 'SILVER', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS quest_completions (id SERIAL PRIMARY KEY, user_id INT NOT NULL, quest_id INT NOT NULL, completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bookings (id SERIAL PRIMARY KEY, user_id INT NOT NULL, unit_id TEXT NOT NULL, project_id TEXT, user_phone TEXT, user_name TEXT, user_company TEXT, status TEXT DEFAULT 'PENDING', amocrm_lead_id TEXT, amocrm_synced BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // --- Новые таблицы: События ---
    await pool.query(`CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, date DATE NOT NULL, time TEXT, type TEXT DEFAULT 'TOUR', spots_total INT DEFAULT 30, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS event_registrations (id SERIAL PRIMARY KEY, event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(event_id, user_id));`);

    // --- Новая таблица: Ипотечные программы ---
    await pool.query(`CREATE TABLE IF NOT EXISTS mortgage_programs (id SERIAL PRIMARY KEY, name TEXT NOT NULL, rate NUMERIC NOT NULL, min_payment INT DEFAULT 10, max_term INT DEFAULT 30, description TEXT, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // --- Миграции ---
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gold_balance INT DEFAULT 0;');
    await pool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await pool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await pool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;');
    await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS feed_url TEXT;');
    await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS feed_synced_at TIMESTAMP;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deals_closed INT DEFAULT 0;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;');
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'agency';");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none';");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_news_at TIMESTAMP;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS can_manage_bookings BOOLEAN DEFAULT FALSE;');
    await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'INIT';");
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passport_sent BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passport_sent_at TIMESTAMP;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS docs_sent BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS docs_sent_at TIMESTAMP;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buyer_name TEXT;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS buyer_phone TEXT;');
    await pool.query('ALTER TABLE units ADD COLUMN IF NOT EXISTS section TEXT;');
    // 152-ФЗ: согласия на обработку ПДн
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_pd BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_pd_at TIMESTAMP;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_transfer BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE bookings ADD COLUMN IF NOT EXISTS consent_transfer_at TIMESTAMP;');
    // 38-ФЗ: застройщик проекта (рекламная пометка)
    await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS developer_name TEXT;');
    await pool.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS video_url TEXT;');

    // --- MAX Messenger platform support (dual-platform: Telegram + MAX) ---
    // Колонка max_id — внешний ID пользователя в мессенджере MAX (аналог telegram_id)
    // Колонка platform — на какой платформе изначально зарегистрировался пользователь
    // ВАЖНО: telegram_id остаётся как был, но теперь допускает NULL (для MAX-юзеров)
    await pool.query('ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;').catch(e => {
      // Не критично — на новой БД constraint мог не существовать
      if (!/does not exist/i.test(e.message)) console.warn('[migration] drop NOT NULL telegram_id:', e.message);
    });
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS max_id BIGINT;');
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'telegram';");
    // Уникальный индекс на max_id (отдельно, partial — чтобы NULL не конфликтовали)
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_max_id ON users(max_id) WHERE max_id IS NOT NULL;');
    // Constraint: должен быть указан хотя бы один внешний ID
    // Не добавляем CHECK constraint напрямую, т.к. он может уронить существующие строки
    // при наличии аномалий. Логика гарантируется на уровне приложения.

    // --- Миссии (автоматические достижения) ---
    await pool.query(`CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      reward_amount INT DEFAULT 0,
      reward_currency TEXT DEFAULT 'SILVER',
      target_count INT DEFAULT 1,
      category TEXT DEFAULT 'general',
      icon TEXT DEFAULT 'star',
      sort_order INT DEFAULT 0
    );`);
    await pool.query(`CREATE TABLE IF NOT EXISTS user_missions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id),
      mission_id INT NOT NULL REFERENCES missions(id),
      progress INT DEFAULT 0,
      completed BOOLEAN DEFAULT FALSE,
      completed_at TIMESTAMP,
      rewarded BOOLEAN DEFAULT FALSE,
      UNIQUE(user_id, mission_id)
    );`);
    // PWA-токен для авторизации вне Telegram
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS pwa_token TEXT;');
    // Трекинг входов для миссии серий
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_date DATE;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS login_streak INT DEFAULT 0;');

    // --- Индексы ---
    await pool.query('CREATE INDEX IF NOT EXISTS idx_users_tg ON users(telegram_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_units_proj ON units(project_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_book_unit ON bookings(unit_id);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_book_user ON bookings(user_id);');
    // Жёсткая защита от двойной брони: PostgreSQL физически не даст
    // создать две активные брони на одну квартиру даже при параллельных запросах.
    await pool.query(`
      WITH ranked AS (
        SELECT id, unit_id, ROW_NUMBER() OVER (
          PARTITION BY unit_id
          ORDER BY
            CASE COALESCE(stage, 'INIT')
              WHEN 'COMPLETE' THEN 4
              WHEN 'DOCS_SENT' THEN 3
              WHEN 'PASSPORT_SENT' THEN 2
              WHEN 'INIT' THEN 1
              ELSE 0
            END DESC,
            created_at DESC,
            id DESC
        ) AS rn
        FROM bookings
        WHERE COALESCE(stage, 'INIT') != 'CANCELLED'
      )
      UPDATE bookings b
      SET stage = 'CANCELLED'
      FROM ranked r
      WHERE b.id = r.id AND r.rn > 1
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_one_active_per_unit
      ON bookings(unit_id)
      WHERE COALESCE(stage, 'INIT') != 'CANCELLED'
    `);
    await pool.query(`
      UPDATE units u
      SET status = 'BOOKED'
      WHERE status = 'FREE'
        AND EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.unit_id = u.id AND COALESCE(b.stage, 'INIT') != 'CANCELLED'
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_news_date ON news(created_at);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ev_date ON events(date);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evreg ON event_registrations(event_id, user_id);');

    // --- События: приватные + дедлайн RSVP ---
    await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;');
    await pool.query('ALTER TABLE events ADD COLUMN IF NOT EXISTS rsvp_deadline TIMESTAMP;');
    await pool.query(`CREATE TABLE IF NOT EXISTS event_invitations (
      id SERIAL PRIMARY KEY,
      event_id INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, user_id)
    );`);
    // --- Ипотека: мин. первоначальный взнос (глобальная настройка) ---
    await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);
    await pool.query(`INSERT INTO app_settings (key, value) VALUES ('min_down_payment_percent', '10') ON CONFLICT DO NOTHING;`);

    // Сид-данные
    const projCheck = await pool.query('SELECT count(*) FROM projects');
    if (parseInt(projCheck.rows[0].count) === 0) {
      await pool.query(`INSERT INTO projects (id, name, floors, units_per_floor, image_url) VALUES ('brk', 'ЖК Бруклин', 12, 6, NULL) ON CONFLICT DO NOTHING`);
    }
    // Обновляем developer_name для известных проектов
    await pool.query(`UPDATE projects SET developer_name = 'ООО СЗ «ХОРОШО»' WHERE id = 'brk' AND developer_name IS NULL`);
    await pool.query(`UPDATE projects SET developer_name = 'ООО СЗ «ХОРОШОЗДЕСЬ»' WHERE id = 'mnh' AND developer_name IS NULL`);
    await pool.query(`UPDATE projects SET developer_name = 'ООО СЗ «ХОРОШОАЛЬЯНС»' WHERE id = 'bbk' AND developer_name IS NULL`);

    const questCheck = await pool.query('SELECT count(*) FROM quests');
    if (parseInt(questCheck.rows[0].count) === 0) {
      await pool.query(`INSERT INTO quests (type, title, reward_xp, reward_amount, reward_currency) VALUES
        ('SHARE', 'Репост новости ЖК Бруклин', 50, 100, 'SILVER'),
        ('TEST', 'Тест: Планировки ЖК Харизма', 100, 200, 'SILVER'),
        ('DEAL', 'Продать 2-к квартиру', 1000, 10, 'GOLD')
      ON CONFLICT DO NOTHING`);
    }

    // Сид миссий
    const missionCheck = await pool.query('SELECT count(*) FROM missions');
    if (parseInt(missionCheck.rows[0].count) === 0) {
      await pool.query(`INSERT INTO missions (code, title, description, reward_amount, reward_currency, target_count, category, icon, sort_order) VALUES
        ('first_booking',    'Первая бронь',          'Забронируйте свою первую квартиру',            200,  'SILVER', 1,  'booking',  'key',       1),
        ('bookings_5',       'Пять броней',           'Забронируйте 5 квартир',                       500,  'SILVER', 5,  'booking',  'layers',    2),
        ('bookings_10',      'Десять броней',         'Забронируйте 10 квартир',                      1000, 'SILVER', 10, 'booking',  'trophy',    3),
        ('bookings_25',      'Четверть сотни',        'Забронируйте 25 квартир',                      5,    'GOLD',   25, 'booking',  'crown',     4),
        ('multi_project',    'Мультипроект',          'Забронируйте квартиры в 2 разных ЖК',          300,  'SILVER', 2,  'explore',  'map',       5),
        ('all_projects',     'Покоритель всех ЖК',   'Забронируйте квартиры во всех 3 ЖК',           5,    'GOLD',   3,  'explore',  'globe',     6),
        ('profile_complete', 'Визитка заполнена',     'Заполните все поля профиля при регистрации',    100,  'SILVER', 1,  'profile',  'user',      7),
        ('login_streak_7',   'Неделя активности',     'Заходите в приложение 7 дней подряд',           300,  'SILVER', 7,  'loyalty',  'flame',     8),
        ('login_streak_30',  'Месяц верности',        'Заходите в приложение 30 дней подряд',          3,    'GOLD',   30, 'loyalty',  'fire',      9)
      ON CONFLICT (code) DO NOTHING`);
    }
    const demoTelegramIds = [999000001, 999000002];
    if (process.env.SEED_DEMO_DATA !== 'true') {
      await withTransaction(async (client) => {
        const demoUsersRes = await client.query('SELECT id FROM users WHERE telegram_id = ANY($1::bigint[])', [demoTelegramIds]);
        const demoUserIds = demoUsersRes.rows.map(r => r.id);
        await client.query("DELETE FROM bookings WHERE unit_id LIKE 'test-%' OR user_id = ANY($1::int[])", [demoUserIds]);
        if (demoUserIds.length > 0) {
          await client.query('DELETE FROM user_missions WHERE user_id = ANY($1::int[])', [demoUserIds]);
          await client.query('DELETE FROM quest_completions WHERE user_id = ANY($1::int[])', [demoUserIds]);
          await client.query('DELETE FROM orders WHERE user_id = ANY($1::int[])', [demoUserIds]);
          await client.query('DELETE FROM event_registrations WHERE user_id = ANY($1::int[])', [demoUserIds]);
          await client.query('DELETE FROM users WHERE id = ANY($1::int[])', [demoUserIds]);
        }
        if (demoUserIds.length > 0) console.log(`🧹 Removed ${demoUserIds.length} demo users`);
      });
    }

    // Тестовые риелторы для презентации
    if (process.env.SEED_DEMO_DATA === 'true') {
      const testRealtors = [
        { tgId: 999000001, firstName: 'Арман', lastName: 'Бисенов', company: 'АН Лидер', deals: 14, bookings: [
          { project: 'mnh', count: 10 }, { project: 'bbk', count: 4 }
        ]},
        { tgId: 999000002, firstName: 'Вагон', lastName: 'Продажев', company: 'АН Триумф', deals: 14, bookings: [
          { project: 'bbk', count: 5 }, { project: 'mnh', count: 9 }
        ]},
      ];
      for (const r of testRealtors) {
        const exists = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [r.tgId]);
        if (exists.rows.length === 0) {
          const uRes = await pool.query(
            `INSERT INTO users (telegram_id, first_name, last_name, company, company_type, phone, is_registered, approval_status, balance, gold_balance, xp_points, deals_closed)
             VALUES ($1, $2, $3, $4, 'agency', '+70000000000', TRUE, 'approved', 500, $5, $6, $5)
             RETURNING id`,
            [r.tgId, r.firstName, r.lastName, r.company, r.deals, r.deals * 100]
          );
          const userId = uRes.rows[0].id;
          for (const b of r.bookings) {
            for (let i = 0; i < b.count; i++) {
              await pool.query(
                `INSERT INTO bookings (user_id, unit_id, project_id, stage, user_name, user_company, created_at)
                 VALUES ($1, $2, $3, 'COMPLETE', $4, $5, NOW() - interval '1 day' * $6)`,
                [userId, `test-${r.tgId}-${b.project}-${i}`, b.project, `${r.firstName} ${r.lastName}`, r.company, Math.floor(Math.random() * 90)]
              );
            }
          }
        }
      }
    }

  } catch (err) { console.error('❌ DB Error:', err); }
};

// =============================================
// XML SYNC
// =============================================
// Извлечь изображение из Avito-формата (<Image url="..."/> или <Image>url</Image>)
function extractAvitoImage(item) {
  const imgBlock = item.Images?.[0]?.Image || item.images?.[0]?.image || [];
  for (const img of imgBlock) {
    if (typeof img === 'string' && img.startsWith('http')) return img;
    if (img?.$?.url) return img.$.url;
    if (img?._ && typeof img._ === 'string') return img._;
  }
  // Также проверим <PlanImages>, <PlanImage> — Profitbase может добавлять отдельно
  const planBlock = item.PlanImages?.[0]?.PlanImage || item.PlanImages?.[0]?.Image || [];
  for (const img of planBlock) {
    if (typeof img === 'string' && img.startsWith('http')) return img;
    if (img?.$?.url) return img.$.url;
  }
  return '';
}

// Извлечь номер квартиры из Avito-объявления
function extractAvitoNumber(item) {
  // Прямые теги номера квартиры (Profitbase может добавлять)
  const candidates = [
    item.FlatNumber?.[0], item.flatNumber?.[0], item['flat-number']?.[0],
    item.Apartment?.[0], item.apartment?.[0], item.ApartmentNumber?.[0],
    item.ObjectNumber?.[0], item.Number?.[0], item.RoomNumber?.[0],
  ];
  for (const c of candidates) {
    if (c && c !== '0' && c !== '') return String(c);
  }
  // Попробовать извлечь из Address: "..., кв. 42" или "..., кв 42"
  const addr = item.Address?.[0] || '';
  const kvMatch = addr.match(/кв\.?\s*(\d+)/i);
  if (kvMatch) return kvMatch[1];
  return null; // вернём null — номер будет назначен автоматически
}

// Универсальный поиск тега — ищет в item по нескольким вариантам имён
function findTag(item, ...names) {
  for (const name of names) {
    const val = item[name]?.[0];
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return null;
}

const projectSyncLocks = new Map();
const FEED_DEBUG_LOGS = process.env.FEED_DEBUG_LOGS === 'true';
const FEED_PREBOOKING_TTL_SECONDS_RAW = parseInt(process.env.FEED_PREBOOKING_TTL_SECONDS || '120', 10);
const FEED_PREBOOKING_TTL_MS = Math.max(0, Number.isFinite(FEED_PREBOOKING_TTL_SECONDS_RAW) ? FEED_PREBOOKING_TTL_SECONDS_RAW : 120) * 1000;

function feedDebugLog(...args) {
  if (FEED_DEBUG_LOGS) console.log(...args);
}

function safeFeedLabel(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.split('/').slice(0, 3).join('/')}`;
  } catch {
    return 'feed';
  }
}

async function insertUnitRows(client, rows) {
  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const base = rowIndex * 10;
      values.push(row.id, row.projectId, row.floor, row.number, row.rooms, row.area, row.price, row.status, row.planUrl, row.section);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
    });

    await client.query(
      `INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url, section)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (id) DO UPDATE SET
         floor = EXCLUDED.floor,
         number = EXCLUDED.number,
         rooms = EXCLUDED.rooms,
         area = EXCLUDED.area,
         price = EXCLUDED.price,
         status = EXCLUDED.status,
         plan_image_url = EXCLUDED.plan_image_url,
         section = EXCLUDED.section,
         updated_at = NOW()`,
      values
    );
  }
}

async function syncProjectWithXml(projectId, url, options = {}) {
  const key = String(projectId);
  const existing = projectSyncLocks.get(key);
  if (existing) {
    if (options.skipIfRunning) {
      console.log(`⏭️ Sync ${key} skipped: already running`);
      return { skipped: true, reason: 'already_running', savedCount: 0 };
    }
    console.log(`⏳ Sync ${key} already running; waiting (${options.reason || 'manual'})`);
    return existing;
  }

  const task = syncProjectWithXmlUnsafe(projectId, url)
    .finally(() => projectSyncLocks.delete(key));
  projectSyncLocks.set(key, task);
  return task;
}

async function syncProjectWithXmlUnsafe(projectId, url) {
  console.log(`🔄 Syncing ${projectId} from ${safeFeedLabel(url)}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
  const xmlText = await response.text();
  const xmlSize = xmlText.length;
  const parser = new xml2js.Parser({ explicitArray: true, trim: true });
  const result = await parser.parseStringPromise(xmlText);

  // Диагностика — вернём вместе с count
  const diag = { format: 'unknown', xmlSize, rawCount: 0, savedCount: 0, noFloorCount: 0, firstItemKeys: [], sampleUnit: null };

  // Auto-detect: пробуем ВСЕ возможные корневые структуры
  let rawItems = [];
  const rootKeys = Object.keys(result || {});
  if (result?.['realty-feed']?.offer) {
    rawItems = result['realty-feed'].offer;
    // Detect Profitbase XML vs standard Yandex
    const feedType = result['realty-feed'].$?.type || '';
    diag.format = feedType === 'profitbase_xml' ? 'profitbase_xml' : 'yandex';
  } else if (result?.Ads?.Ad) {
    rawItems = result.Ads.Ad; diag.format = 'avito';
  } else if (result?.ads?.ad) {
    rawItems = result.ads.ad; diag.format = 'avito-lower';
  } else if (result?.feed?.offer) {
    rawItems = result.feed.offer; diag.format = 'cian';
  } else {
    // Последняя попытка: берём первый массив в любом корне
    for (const key of rootKeys) {
      const sub = result[key];
      if (sub && typeof sub === 'object') {
        for (const subKey of Object.keys(sub)) {
          if (Array.isArray(sub[subKey]) && sub[subKey].length > 0 && typeof sub[subKey][0] === 'object') {
            rawItems = sub[subKey];
            diag.format = `auto:${key}.${subKey}`;
            break;
          }
        }
      }
      if (rawItems.length) break;
    }
  }

  diag.rawCount = rawItems.length;
  if (!rawItems.length) {
    diag.rootKeys = rootKeys;
    // Вложенные ключи для диагностики
    diag.subKeys = {};
    for (const k of rootKeys) {
      if (result[k] && typeof result[k] === 'object') diag.subKeys[k] = Object.keys(result[k]);
    }
    console.warn(`⚠️ 0 items. Root: ${rootKeys}`, diag.subKeys);
    return diag;
  }

  const firstItem = rawItems[0];
  diag.firstItemKeys = Object.keys(firstItem);
  feedDebugLog(`📋 Format: ${diag.format}, items: ${rawItems.length}, keys: ${diag.firstItemKeys.join(', ')}`);
  feedDebugLog(`🔍 Sample: ${JSON.stringify(firstItem).slice(0, 1000)}`);

  // Извлечь этаж здания из Avito <Floors>
  let buildingFloors = 0;

  // Normalize
  const units = rawItems.map((item, idx) => {
    // Этаж — ищем во всех вариантах
    const floorRaw = findTag(item, 'floor', 'Floor', 'Этаж', 'this_floor', 'floor_number');
    const floor = parseInt(floorRaw || '0') || 0;

    // Общее кол-во этажей здания (прямой тег + вложенный <house><floors-total>)
    let totalFloors = parseInt(findTag(item, 'Floors', 'floors', 'floors-total', 'total_floors', 'building_floors') || '0') || 0;
    if (!totalFloors && item.house?.[0]?.['floors-total']?.[0]) {
      totalFloors = parseInt(item.house[0]['floors-total'][0]) || 0;
    }
    if (totalFloors > buildingFloors) buildingFloors = totalFloors;

    // ID — Profitbase XML uses internal-id attribute on <offer>
    const id = item.$?.['internal-id'] || findTag(item, 'Id', 'id', 'ID') || `unit-${idx}`;

    // Номер квартиры — Profitbase: <number>, Yandex: <flat-number>, Avito: extractAvitoNumber
    const number = findTag(item, 'number', 'flat-number', 'apartment', 'flat_number', 'object_number')
      || extractAvitoNumber(item)
      || (item.location?.[0]?.apartment?.[0])
      || null;

    // Секция / подъезд — Profitbase: <building-section>
    const section = findTag(item, 'building-section', 'section', 'Section', 'building_section') || null;

    // Комнаты
    const roomsRaw = (findTag(item, 'rooms', 'Rooms', 'room_count') || '').toString();
    let rooms = parseInt(roomsRaw.replace(/\D/g, '') || '0');
    if (roomsRaw.toLowerCase().includes('студ') || findTag(item, 'studio', 'is-studio', 'IsStudio') === '1') rooms = 0;

    // Площадь — Profitbase/Yandex: <area><value>, Avito: <Square>
    const areaTag = item.area?.[0];
    const area = parseFloat(
      findTag(item, 'Square', 'square', 'TotalArea', 'total_area')
      || (typeof areaTag === 'object' ? areaTag?.value?.[0] : areaTag)
      || '0'
    );

    // Цена — Profitbase/Yandex: <price><value>, Avito: <Price>
    const priceTag = item.price?.[0];
    const price = parseFloat(
      (findTag(item, 'Price', 'price_value') || (typeof priceTag === 'object' ? priceTag?.value?.[0] : priceTag) || '0')
      .toString().replace(/[\s\u00a0,]/g, '')
    );

    // Изображение — Profitbase XML: <image type="plan">URL</image>
    let planUrl = '';
    const imageNodes = item.image || [];
    // 1. Profitbase: ищем <image type="plan">
    for (const img of imageNodes) {
      if (img?.$?.type === 'plan' && img._) { planUrl = img._; break; }
    }
    // 2. Любой <image> с URL
    if (!planUrl) {
      for (const img of imageNodes) {
        if (img?._ && String(img._).startsWith('http')) { planUrl = img._; break; }
        if (typeof img === 'string' && img.startsWith('http')) { planUrl = img; break; }
      }
    }
    // 3. Avito/другие форматы
    if (!planUrl) planUrl = extractAvitoImage(item)
      || findTag(item, 'planning-image', 'plan-image', 'plan_image', 'PlanImage')
      || findTag(item, 'photo')
      || '';

    // Статус — Profitbase: <status_id> (1=в продаже, 2=продана, 3=забронирована)
    const statusId = findTag(item, 'status_id', 'status-id');
    const statusParts = [
      findTag(item, 'status', 'Status', 'status-humanized'),
      findTag(item, 'AdStatus', 'deal-status', 'sales-status'),
      findTag(item, 'Description', 'description')
    ].filter(Boolean);
    const statusRaw = statusParts.map(s => typeof s === 'object' ? JSON.stringify(s) : s).join(' ').toLowerCase();

    return { id: String(id), floor, number, rooms, area, price, planUrl, statusId, statusRaw, section };
  });

  // Логируем первые 5 юнитов с полной статус-информацией
  units.slice(0, 5).forEach((u, i) => feedDebugLog(`🏠 [${i}]: fl=${u.floor} sec=${u.section} num=${u.number} rm=${u.rooms} area=${u.area} price=${u.price} statusId="${u.statusId}" statusRaw="${u.statusRaw}" img=${u.planUrl ? '✅' : '❌'}`));

  // Статистика по status_id из фида
  const feedStatusMap = {};
  for (const u of units) {
    const key = `sid=${u.statusId}|raw=${u.statusRaw.slice(0, 40)}`;
    feedStatusMap[key] = (feedStatusMap[key] || 0) + 1;
  }
  feedDebugLog('📊 Feed status distribution:', JSON.stringify(feedStatusMap));

  let maxFloor = buildingFloors || 1;
  const floorCounts = {};
  const floorCounters = {};
  const unitRowsById = new Map();

  // Сохраняем unit_id с активными бронями ДО удаления
  const bookedRes = await pool.query(
    "SELECT DISTINCT unit_id FROM bookings WHERE project_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'",
    [projectId]
  );
  const bookedUnitIds = new Set(bookedRes.rows.map(r => r.unit_id));
  if (bookedUnitIds.size > 0) {
    console.log(`🔒 Preserving ${bookedUnitIds.size} booked units during sync`);
  }

  for (const u of units) {
    // Если этаж не определён — ставим 1, НЕ пропускаем
    const floor = u.floor > 0 ? u.floor : 1;
    if (u.floor < 1) diag.noFloorCount++;
    if (floor > maxFloor) maxFloor = floor;
    if (!floorCounts[floor]) floorCounts[floor] = 0;
    floorCounts[floor]++;
    if (!floorCounters[floor]) floorCounters[floor] = 0;
    floorCounters[floor]++;

    const unitNumber = u.number || String(floor * 100 + floorCounters[floor]);

    // === СТАТУС: многоуровневая логика ===
    let status = 'FREE';
    const sid = u.statusId ? parseInt(u.statusId) : null;
    const s = u.statusRaw;

    // 1. Profitbase status_id (стандарт: 1=свободно, 2=продано, 3=забронировано)
    if (sid === 2 || sid === 4 || sid === 5) {
      status = 'SOLD';
    } else if (sid === 3) {
      status = 'BOOKED';
    }

    // 2. Текстовый парсинг — дополняет или перекрывает status_id
    // (потому что status_id может быть кастомным, а текст — точнее)
    if (status === 'FREE' && s) {
      if (s.includes('sold') || s.includes('продан') || s.includes('busy') || s.includes('занят') || s.includes('реализован') || s.includes('не для продажи') || s.includes('снят')) {
        status = 'SOLD';
      } else if (s.includes('book') || s.includes('reserv') || s.includes('бронь') || s.includes('забронир') || s.includes('резерв')) {
        status = 'BOOKED';
      }
    }

    // 3. Если у юнита есть активная бронь в нашей системе — статус BOOKED, независимо от фида
    if (bookedUnitIds.has(u.id)) {
      status = 'BOOKED';
    }

    unitRowsById.set(u.id, {
      id: u.id,
      projectId,
      floor,
      number: unitNumber,
      rooms: u.rooms,
      area: u.area,
      price: u.price,
      status,
      planUrl: u.planUrl,
      section: u.section,
    });
  }

  const unitRows = [...unitRowsById.values()];
  const maxUnitsOnFloor = Math.max(...Object.values(floorCounts).map(Number), 1);
  let savedStatuses = {};

  await withTransaction(async (client) => {
    await client.query('DELETE FROM units WHERE project_id = $1', [projectId]);
    if (unitRows.length > 0) await insertUnitRows(client, unitRows);
    await client.query(
      `UPDATE units SET status = 'BOOKED', updated_at = NOW()
       WHERE project_id = $1
         AND id IN (
           SELECT DISTINCT unit_id FROM bookings
           WHERE project_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'
         )`,
      [projectId]
    );
    await client.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3, feed_synced_at = NOW() WHERE id = $4', [maxFloor, maxUnitsOnFloor, url, projectId]);

    // Подсчёт сохранённых статусов из БД (после парсинга)
    const savedRes = await client.query('SELECT status, count(*) as c FROM units WHERE project_id = $1 GROUP BY status', [projectId]);
    savedStatuses = {};
    for (const r of savedRes.rows) savedStatuses[r.status] = parseInt(r.c);
  });

  // Секции
  const sections = [...new Set(units.map(u => u.section).filter(Boolean))];

  diag.savedCount = unitRows.length;
  diag.sampleUnit = units[0] || null;
  diag.floors = maxFloor;
  diag.maxPerFloor = maxUnitsOnFloor;
  diag.sections = sections;
  diag.feedStatusMap = feedStatusMap;
  diag.savedStatuses = savedStatuses;
  console.log(`✅ Synced ${unitRows.length}/${rawItems.length} for ${projectId} (${diag.format}, ${maxFloor} fl, ${maxUnitsOnFloor}/fl, sections=${sections.join(',')}, statuses=${JSON.stringify(savedStatuses)}, noFloor=${diag.noFloorCount})`);
  return diag;
}

async function refreshProjectFeed(projectId, options = {}) {
  const project = (await pool.query('SELECT id, feed_url FROM projects WHERE id = $1', [projectId])).rows[0];
  if (!project) return { ok: false, status: 404, msg: 'Project not found' };
  if (!project.feed_url) return { ok: true, skipped: true, reason: 'no_feed_url' };
  try {
    const diag = await syncProjectWithXml(project.id, project.feed_url, options);
    return { ok: true, diag };
  } catch (e) {
    console.error(`Feed refresh failed for ${project.id}:`, e.message);
    return { ok: false, status: 503, msg: 'Не удалось обновить данные по фиду. Попробуйте через минуту.' };
  }
}

async function refreshFeedBeforeBooking(unitId, fallbackProjectId) {
  const unitRes = await pool.query('SELECT project_id FROM units WHERE id = $1', [unitId]);
  const projectId = unitRes.rows[0]?.project_id || fallbackProjectId;
  if (!projectId) return { ok: false, status: 404, msg: 'Квартира не найдена' };

  if (FEED_PREBOOKING_TTL_MS > 0) {
    const projectRes = await pool.query(
      'SELECT EXTRACT(EPOCH FROM (NOW() - feed_synced_at)) * 1000 AS feed_age_ms FROM projects WHERE id = $1',
      [projectId]
    );
    const ageMs = projectRes.rows[0]?.feed_age_ms === null || projectRes.rows[0]?.feed_age_ms === undefined
      ? Number.POSITIVE_INFINITY
      : Number(projectRes.rows[0].feed_age_ms);
    if (ageMs >= 0 && ageMs < FEED_PREBOOKING_TTL_MS) {
      return { ok: true, skipped: true, reason: 'fresh_feed', ageMs };
    }
  }

  return refreshProjectFeed(projectId, { reason: 'pre-booking' });
}

cron.schedule('*/5 * * * *', async () => {
  try {
    const res = await pool.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
    for (const project of res.rows) {
      if (project.feed_url) await syncProjectWithXml(project.id, project.feed_url, { reason: 'cron', skipIfRunning: true });
    }
  } catch (e) { console.error('Cron Error:', e); }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get('/api/ping', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.json({ status: 'error', db: 'disconnected', error: e.message });
  }
});

app.get('/api/test-notify', async (req, res) => {
  try {
    if (process.env.ENABLE_TEST_NOTIFY !== 'true') return res.status(404).json({ error: 'Not found' });
    const usersRes = await pool.query('SELECT telegram_id, first_name FROM users WHERE is_admin = TRUE LIMIT 1');
    if (usersRes.rows.length === 0) return res.json({ error: 'No admin found' });
    const admin = usersRes.rows[0];
    const result = await notifyUserTelegram(admin.telegram_id, '🔔 <b>Тестовое уведомление</b>\n\nЕсли ты это видишь — уведомления работают!');
    res.json({ sent_to: admin.telegram_id, name: admin.first_name, telegram_response: result });
  } catch (e) { res.json({ error: e.message }); }
});

// =============================================
// API: АВТОРИЗАЦИЯ
// =============================================
app.post('/api/auth', rateLimit(900000, 30), async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No data' });
  try {
    const tgUser = parseTelegramUser(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid initData signature' });
    let dbUser = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (dbUser.rows.length === 0) {
      dbUser = await pool.query('INSERT INTO users (telegram_id, username, first_name, gold_balance, balance) VALUES ($1, $2, $3, 0, 0) RETURNING *', [tgUser.id, tgUser.username, tgUser.first_name]);
    }
    // Обновить серию входов
    const user = dbUser.rows[0];
    // Генерировать PWA-токен если его нет
    if (!user.pwa_token) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE users SET pwa_token = $1 WHERE id = $2', [token, user.id]);
      user.pwa_token = token;
    }
    const today = new Date().toISOString().slice(0, 10);
    const lastLogin = user.last_login_date ? new Date(user.last_login_date).toISOString().slice(0, 10) : null;
    if (lastLogin !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const newStreak = (lastLogin === yesterday) ? (user.login_streak || 0) + 1 : 1;
      await pool.query('UPDATE users SET last_login_date = $1, login_streak = $2 WHERE id = $3', [today, newStreak, user.id]);
      user.login_streak = newStreak;
      user.last_login_date = today;
      // Проверить миссии входов (асинхронно)
      checkMissions(user.id, 'login').catch(() => {});
    }
    res.json({ user });
  } catch (e) {
    console.error('Auth error:', e);
    res.status(500).json({ error: 'Auth error' });
  }
});

// =============================================
// API: АВТОРИЗАЦИЯ ПО PWA-ТОКЕНУ
// =============================================
app.post('/api/auth/token', rateLimit(900000, 30), async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'No token' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE pwa_token = $1', [token]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid token' });
    const user = result.rows[0];
    // Обновить серию входов
    const today = new Date().toISOString().slice(0, 10);
    const lastLogin = user.last_login_date ? new Date(user.last_login_date).toISOString().slice(0, 10) : null;
    if (lastLogin !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const newStreak = (lastLogin === yesterday) ? (user.login_streak || 0) + 1 : 1;
      await pool.query('UPDATE users SET last_login_date = $1, login_streak = $2 WHERE id = $3', [today, newStreak, user.id]);
      user.login_streak = newStreak;
      checkMissions(user.id, 'login').catch(() => {});
    }
    res.json({ user });
  } catch (e) {
    console.error('Token auth error:', e);
    res.status(500).json({ error: 'Auth error' });
  }
});

// =============================================
// API: АВТОРИЗАЦИЯ ЧЕРЕЗ MAX MESSENGER
// =============================================
// Зеркало /api/auth, но валидирует MAX initData и работает с колонкой max_id.
// Endpoint возвращает 503 если MAX_ENABLED != 'true' — это безопасный no-op.
app.post('/api/auth/max', rateLimit(900000, 30), async (req, res) => {
  if (!isMaxEnabled()) {
    return res.status(503).json({ error: 'MAX platform отключена. Установите MAX_ENABLED=true.' });
  }
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No data' });
  try {
    const maxUser = parseMaxInitData(initData);
    if (!maxUser || !maxUser.id) return res.status(401).json({ error: 'Invalid MAX initData signature' });

    const isAdminMaxId = process.env.ADMIN_MAX_ID && String(maxUser.id) === String(process.env.ADMIN_MAX_ID);

    let dbUser = await pool.query('SELECT * FROM users WHERE max_id = $1', [maxUser.id]);
    if (dbUser.rows.length === 0) {
      dbUser = await pool.query(
        `INSERT INTO users (max_id, username, first_name, platform, gold_balance, balance, is_admin, is_registered)
         VALUES ($1, $2, $3, 'max', 0, 0, $4, $4) RETURNING *`,
        [maxUser.id, maxUser.username || null, maxUser.first_name || '', isAdminMaxId]
      );
    } else if (isAdminMaxId && !dbUser.rows[0].is_admin) {
      // Если юзер уже есть, но флаг admin ещё не выставлен — ставим
      await pool.query('UPDATE users SET is_admin = TRUE, is_registered = TRUE WHERE max_id = $1', [maxUser.id]);
      dbUser.rows[0].is_admin = true;
      dbUser.rows[0].is_registered = true;
    }
    const user = dbUser.rows[0];

    // Генерировать PWA-токен если нет (универсальный, единая логика с Telegram)
    if (!user.pwa_token) {
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query('UPDATE users SET pwa_token = $1 WHERE id = $2', [token, user.id]);
      user.pwa_token = token;
    }

    // Серия входов (единая логика с Telegram)
    const today = new Date().toISOString().slice(0, 10);
    const lastLogin = user.last_login_date ? new Date(user.last_login_date).toISOString().slice(0, 10) : null;
    if (lastLogin !== today) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const newStreak = (lastLogin === yesterday) ? (user.login_streak || 0) + 1 : 1;
      await pool.query('UPDATE users SET last_login_date = $1, login_streak = $2 WHERE id = $3', [today, newStreak, user.id]);
      user.login_streak = newStreak;
      user.last_login_date = today;
      checkMissions(user.id, 'login').catch(() => {});
    }
    res.json({ user });
  } catch (e) {
    console.error('[MAX] Auth error:', e);
    res.status(500).json({ error: 'Auth error' });
  }
});

async function applyApplicationDecision(userId, action) {
  const id = Number(userId);
  if (!id || !['approve', 'reject'].includes(action)) {
    return { ok: false, status: 'bad_request', message: 'Некорректное действие' };
  }

  const userRes = await pool.query('SELECT id, telegram_id, max_id, platform, first_name FROM users WHERE id = $1', [id]);
  if (userRes.rows.length === 0) {
    return { ok: false, status: 'not_found', message: 'Заявка не найдена' };
  }

  const user = userRes.rows[0];
  if (action === 'approve') {
    await pool.query(`UPDATE users SET is_registered = TRUE, approval_status = 'approved' WHERE id = $1`, [id]);
    notifyUser(user, `🎉 <b>Добро пожаловать в Клуб Партнёров!</b>\n\nПривет, ${user.first_name || 'партнёр'}! Ваша заявка одобрена.`);
    return { ok: true, label: 'ОДОБРЕНО', notification: '✅ Одобрено!' };
  }

  await pool.query(`UPDATE users SET approval_status = 'rejected' WHERE id = $1`, [id]);
  notifyUser(user, `❌ <b>Заявка отклонена</b>\n\nЕсли это ошибка, свяжитесь с отделом продаж.`);
  return { ok: true, label: 'ОТКЛОНЕНО', notification: '❌ Отклонено' };
}

// =============================================
// API: WEBHOOK MAX MESSENGER
// =============================================
// Принимает обновления от MAX (новые сообщения, callback'и).
// На старте просто логируем — обработка событий по мере необходимости.
app.post('/api/max-webhook', async (req, res) => {
  // Всегда отвечаем 200 быстро, чтобы MAX не ретраил
  res.status(200).json({ ok: true });
  if (!isMaxEnabled()) return;
  if (process.env.MAX_WEBHOOK_SECRET && req.get('X-Max-Bot-Api-Secret') !== process.env.MAX_WEBHOOK_SECRET) {
    console.warn('[MAX] webhook secret mismatch');
    return;
  }
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [req.body];
    for (const update of updates) {
      console.log('[MAX] webhook update:', JSON.stringify(update).slice(0, 500));
      const updateType = update?.update_type;
      const text = getMaxUpdateText(update).toLowerCase();

      if (updateType === 'message_callback') {
        const payload = getMaxCallbackPayload(update);
        const callbackId = getMaxCallbackId(update);
        const [action, userIdStr] = String(payload).split('_');
        const actorId = getMaxUpdateUserId(update);

        if (process.env.ADMIN_MAX_ID && String(actorId) !== String(process.env.ADMIN_MAX_ID)) {
          await answerMaxCallback(callbackId, 'Недостаточно прав');
          continue;
        }

        if (action === 'approve' || action === 'reject') {
          const result = await applyApplicationDecision(userIdStr, action);
          const originalText = getMaxMessageText(update) || 'Заявка обработана';
          const statusLine = result.ok ? `\n\n${action === 'approve' ? '✅' : '❌'} <b>${result.label}</b>` : `\n\n⚠️ <b>${result.message}</b>`;
          await answerMaxCallback(callbackId, result.notification || result.message, originalText + statusLine);
        }
        continue;
      }

      if (updateType === 'bot_started' || text === '/start' || text === 'start') {
        const userId = getMaxUpdateUserId(update);
        await sendMaxMessage(
          userId,
          `Добро пожаловать в Клуб Партнёров!\n\nОткройте мини-приложение кнопкой ниже или через кнопку mini-app в чате.\n${getMaxMiniAppLink()}`,
          buildMaxStartKeyboard()
        );
      }
    }
  } catch (e) {
    console.error('[MAX] webhook error:', e.message);
  }
});

// =============================================
// АВАТАРКА
// =============================================
app.post('/api/avatar', async (req, res) => {
  try {
    const { initData, avatarData } = req.body;
    const dbUser = await resolveDbUser(initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    if (!avatarData) return res.status(400).json({ error: 'No avatar data' });
    if (avatarData.length > 1400000) return res.status(400).json({ error: 'Image too large' });
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarData, dbUser.id]);
    res.json({ success: true, avatar_url: avatarData });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// РЕГИСТРАЦИЯ С МОДЕРАЦИЕЙ
// =============================================
app.post('/api/register', async (req, res) => {
  const { initData, firstName, lastName, companyType, company, phone, consentPd } = req.body;
  try {
    const authUser = await resolveDbUser(initData);
    if (!authUser) return res.status(401).json({ error: 'Invalid signature' });
    if (!consentPd) return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });

    await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, company_type = $3, company = $4, phone = $5, approval_status = 'pending', consent_pd = TRUE, consent_pd_at = NOW() WHERE id = $6`,
      [firstName, lastName, companyType || 'agency', company, phone, authUser.id]
    );
    const userId = authUser.id;
    const platform = authUser._platform || 'telegram';
    const typeLabel = companyType === 'ip' ? 'ИП' : 'Агентство';
    const platformLabel = platform === 'max' ? '🟣 MAX' : '✈️ Telegram';
    const text = `📋 <b>Новая заявка на вход!</b>\n\n👤 ${firstName} ${lastName}\n🏢 ${typeLabel}: ${company}\n📞 ${phone}\n📲 ${platformLabel}`;
    const keyboard = [[
      { text: '✅ Одобрить', callback_data: `approve_${userId}` },
      { text: '❌ Отклонить', callback_data: `reject_${userId}` }
    ]];
    // Дублируем уведомление админу в оба мессенджера (TG обязательно, MAX если включён)
    notifyAdmin(text, keyboard);
    // Проверить миссию «профиль заполнен» (асинхронно)
    if (userId) checkMissions(userId, 'register').catch(() => {});
    res.json({ success: true, status: 'pending' });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Error' });
  }
});

// Список заявок (админ) — ЗАЩИЩЁН
app.post('/api/applications', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const result = await pool.query(
      `SELECT id, telegram_id, max_id, platform, first_name, last_name, company_type, company, phone, created_at
       FROM users WHERE approval_status = 'pending' ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Applications error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Одобрить заявку (админ)
app.post('/api/applications/:userId/approve', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const result = await applyApplicationDecision(req.params.userId, 'approve');
    if (!result.ok) return res.status(result.status === 'not_found' ? 404 : 400).json({ error: result.message });
    res.json({ success: true });
  } catch (e) { console.error('Approve error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Отклонить заявку (админ)
app.post('/api/applications/:userId/reject', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const result = await applyApplicationDecision(req.params.userId, 'reject');
    if (!result.ok) return res.status(result.status === 'not_found' ? 404 : 400).json({ error: result.message });
    res.json({ success: true });
  } catch (e) { console.error('Reject error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Telegram webhook для inline-кнопок
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const callback = req.body?.callback_query;
    if (!callback) return res.sendStatus(200);
    const data = callback.data;
    const [action, userIdStr] = data.split('_');
    const userId = parseInt(userIdStr);
    const BOT_TOKEN = process.env.BOT_TOKEN;

    if (action === 'approve') {
      const decision = await applyApplicationDecision(userId, 'approve');
      if (BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callback.id, text: decision.notification || decision.message })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: callback.message.chat.id, message_id: callback.message.message_id, text: callback.message.text + `\n\n✅ <b>${decision.label || 'ОДОБРЕНО'}</b>`, parse_mode: 'HTML' })
        });
      }
    } else if (action === 'reject') {
      const decision = await applyApplicationDecision(userId, 'reject');
      if (BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callback.id, text: decision.notification || decision.message })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: callback.message.chat.id, message_id: callback.message.message_id, text: callback.message.text + `\n\n❌ <b>${decision.label || 'ОТКЛОНЕНО'}</b>`, parse_mode: 'HTML' })
        });
      }
    }
    res.sendStatus(200);
  } catch (e) { console.error('Webhook error:', e); res.sendStatus(200); }
});

// =============================================
// API: НОВОСТИ
// =============================================
app.get('/api/news', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Failed to fetch news' }); }
});

app.post('/api/news', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      const { title, text, image_url, video_url, project_name, progress, checklist } = req.body;
      await pool.query('INSERT INTO news (title, text, image_url, video_url, project_name, progress, checklist) VALUES ($1, $2, $3, $4, $5, $6, $7)', [title, text, image_url, video_url, project_name, progress, JSON.stringify(checklist)]);
      const usersRes = await pool.query('SELECT telegram_id, max_id, platform FROM users WHERE is_registered = TRUE');
      const projectLabel = project_name ? ` (${project_name})` : '';
      const newsText = `📰 <b>Новая новость${projectLabel}</b>\n\n${title}\n\n${(text || '').slice(0, 150)}${(text || '').length > 150 ? '...' : ''}`;
      for (const u of usersRes.rows) { notifyUser(u, newsText, getAppOpenKeyboard()); }
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/news/unread-count', async (req, res) => {
  try {
    const dbUser = await resolveDbUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    const lastSeen = dbUser.last_seen_news_at;
    let countRes;
    if (lastSeen) { countRes = await pool.query('SELECT COUNT(*) FROM news WHERE created_at > $1', [lastSeen]); }
    else { countRes = await pool.query('SELECT COUNT(*) FROM news'); }
    res.json({ count: parseInt(countRes.rows[0].count) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/news/mark-seen', async (req, res) => {
  try {
    const dbUser = await resolveDbUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    await pool.query('UPDATE users SET last_seen_news_at = NOW() WHERE id = $1', [dbUser.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/news/:id', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      await pool.query('DELETE FROM news WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/news/:id', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      const { title, text, image_url, video_url, project_name, progress, checklist } = req.body;
      await pool.query(`UPDATE news SET title=$1, text=$2, image_url=$3, video_url=$4, project_name=$5, progress=$6, checklist=$7 WHERE id=$8`, [title, text, image_url, video_url, project_name, progress, JSON.stringify(checklist), req.params.id]);
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: МАГАЗИН
// =============================================
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products WHERE is_active = TRUE ORDER BY currency DESC, price ASC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

app.post('/api/products', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      const { title, price, currency, image_url } = req.body;
      await pool.query('INSERT INTO products (title, price, currency, image_url) VALUES ($1, $2, $3, $4)', [title, price, currency || 'SILVER', image_url]);
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      const { title, price, currency, image_url } = req.body;
      await pool.query('UPDATE products SET title = $1, price = $2, currency = $3, image_url = $4 WHERE id = $5',
        [title, price, currency || 'SILVER', image_url, req.params.id]);
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    if (await isAdmin(req.body.initData)) {
      await pool.query('UPDATE products SET is_active = FALSE WHERE id = $1', [req.params.id]);
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/buy', async (req, res) => {
  const { initData, productId } = req.body;
  try {
    const tgUser = await resolveDbUser(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const result = await withTransaction(async (client) => {
      const userRes = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [tgUser.id]);
      const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
      if (userRes.rows.length === 0 || prodRes.rows.length === 0) throw { status: 404, msg: 'Not found' };
      const user = userRes.rows[0]; const product = prodRes.rows[0];
      if (product.currency === 'GOLD') {
        if (user.gold_balance < product.price) throw { status: 400, msg: 'Не хватает золота' };
        await client.query('UPDATE users SET gold_balance = gold_balance - $1 WHERE id = $2', [product.price, user.id]);
      } else {
        if (user.balance < product.price) throw { status: 400, msg: 'Не хватает серебра' };
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [product.price, user.id]);
      }
      await client.query('INSERT INTO orders (user_id, product_id, price, currency) VALUES ($1, $2, $3, $4)', [user.id, product.id, product.price, product.currency]);
      return { success: true };
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.msg });
    res.status(500).json({ error: 'Buy error' });
  }
});

app.post('/api/admin/user-orders', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { userId } = req.body;
    const result = await pool.query(`
      SELECT o.id, o.price, o.currency, o.status, o.created_at, p.title as product_title
      FROM orders o LEFT JOIN products p ON o.product_id = p.id
      WHERE o.user_id = $1 ORDER BY o.created_at DESC
    `, [userId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: ШАХМАТКА
// =============================================
app.get('/api/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Редактирование проекта (название, этажи, кв/этаж)
app.put('/api/projects/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { name, floors, unitsPerFloor, imageUrl } = req.body;
    const sets = []; const vals = []; let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (floors) { sets.push(`floors = $${idx++}`); vals.push(parseInt(floors)); }
    if (unitsPerFloor) { sets.push(`units_per_floor = $${idx++}`); vals.push(parseInt(unitsPerFloor)); }
    if (imageUrl !== undefined) { sets.push(`image_url = $${idx++}`); vals.push(String(imageUrl || '').trim() || null); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Удаление проекта + его квартиры + бронирования
app.delete('/api/projects/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const pid = req.params.id;
    await pool.query('DELETE FROM bookings WHERE project_id = $1', [pid]);
    await pool.query('DELETE FROM units WHERE project_id = $1', [pid]);
    await pool.query('DELETE FROM projects WHERE id = $1', [pid]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Пересинхронизировать проект из сохранённого feed_url
app.post('/api/projects/:id/resync', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const project = (await pool.query('SELECT * FROM projects WHERE id = $1', [req.params.id])).rows[0];
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.feed_url) return res.status(400).json({ error: 'No feed_url saved' });
    const diag = await syncProjectWithXml(project.id, project.feed_url);
    const count = typeof diag === 'object' ? diag.savedCount : diag;
    res.json({ success: true, count, diag });
  } catch (e) { res.status(500).json({ error: 'Resync failed: ' + e.message }); }
});

async function handleProjectUnits(req, res) {
  try {
    const adminView = await canManageBookingsRequest(req);
    const result = adminView
      ? await pool.query(`
        SELECT u.*,
               b.buyer_name AS booking_buyer_name,
               b.buyer_phone AS booking_buyer_phone,
               agent.first_name AS booking_agent_name,
               agent.last_name AS booking_agent_last_name,
               agent.phone AS booking_agent_phone,
               agent.company AS booking_agent_company,
               agent.company_type AS booking_agent_company_type
        FROM units u
        LEFT JOIN LATERAL (
          SELECT * FROM bookings WHERE unit_id = u.id AND COALESCE(stage, 'INIT') != 'CANCELLED' ORDER BY created_at DESC LIMIT 1
        ) b ON TRUE
        LEFT JOIN users agent ON b.user_id = agent.id
        WHERE u.project_id = $1
      `, [req.params.projectId])
      : await pool.query('SELECT * FROM units WHERE project_id = $1', [req.params.projectId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
}

app.get('/api/units/:projectId', handleProjectUnits);
app.post('/api/units/:projectId', handleProjectUnits);

app.post('/api/sync-xml-url', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden: admin only' });
    const { url, projectId, projectName } = req.body;
    if (!url || !projectId) return res.status(400).json({ error: 'No URL or ProjectID' });
    // Создаём проект если не существует (upsert)
    await pool.query(
      `INSERT INTO projects (id, name, floors, units_per_floor, feed_url)
       VALUES ($1, $2, 1, 1, $3)
       ON CONFLICT (id) DO UPDATE SET feed_url = $3`,
      [projectId, projectName || projectId, url]
    );
    const diag = await syncProjectWithXml(projectId, url);
    const count = typeof diag === 'object' ? diag.savedCount : diag;
    res.json({ success: true, count, projectId, diag });
  } catch (e) { res.status(500).json({ error: 'Sync failed: ' + e.message }); }
});

// Диагностика: показать структуру фида, не сохраняя
app.post('/api/debug-feed', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'No URL' });
    const response = await fetch(url);
    if (!response.ok) return res.status(400).json({ error: `Feed returned ${response.status}` });
    const xmlText = await response.text();
    const parser = new xml2js.Parser({ explicitArray: true, trim: true });
    const result = await parser.parseStringPromise(xmlText);
    const rootKeys = Object.keys(result || {});
    let format = 'unknown'; let itemCount = 0; let sampleItems = [];
    if (result?.['realty-feed']?.offer) {
      const feedType = result['realty-feed'].$?.type || '';
      format = feedType === 'profitbase_xml' ? 'profitbase_xml' : 'yandex';
      itemCount = result['realty-feed'].offer.length;
      sampleItems = result['realty-feed'].offer.slice(0, 3);
    }
    else if (result?.Ads?.Ad) { format = 'avito'; itemCount = result.Ads.Ad.length; sampleItems = result.Ads.Ad.slice(0, 3); }
    else if (result?.feed?.offer) { format = 'cian'; itemCount = result.feed.offer.length; sampleItems = result.feed.offer.slice(0, 3); }
    // Показываем все ключи первого элемента и 3 примера в полном виде
    const firstKeys = sampleItems[0] ? Object.keys(sampleItems[0]) : [];
    // Статистика по статусам
    const allItems = sampleItems.length > 0 ? (result?.['realty-feed']?.offer || result?.Ads?.Ad || result?.feed?.offer || []) : [];
    const statusStats = {};
    for (const item of allItems) {
      const sid = item.status_id?.[0] || item['status-id']?.[0] || 'unknown';
      const sname = item.status?.[0] || item['status-humanized']?.[0] || '';
      const key = `${sid}:${sname}`;
      statusStats[key] = (statusStats[key] || 0) + 1;
    }
    // Секции
    const sectionSet = new Set();
    for (const item of allItems) {
      const sec = item['building-section']?.[0] || item.section?.[0];
      if (sec) sectionSet.add(sec);
    }
    res.json({
      format, rootKeys, itemCount, firstItemKeys: firstKeys,
      samples: sampleItems.map(s => JSON.stringify(s).slice(0, 3000)),
      xmlPreview: xmlText.slice(0, 500),
      statusStats, sections: [...sectionSet],
    });
  } catch (e) { res.status(500).json({ error: 'Debug failed: ' + e.message }); }
});

app.post('/api/make-admin', async (req, res) => {
  try {
    const { telegramId, secret } = req.body;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    if (!ADMIN_SECRET) return res.status(500).json({ error: 'ADMIN_SECRET not configured' });
    if (secret !== ADMIN_SECRET) return res.status(403).json({ error: 'Wrong secret' });
    if (!telegramId) return res.status(400).json({ error: 'No telegramId' });
    await pool.query('UPDATE users SET is_admin = TRUE WHERE telegram_id = $1', [telegramId]);
    res.json({ success: true, message: `User ${telegramId} is now admin` });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Список пользователей (админ) — ЗАЩИЩЁН
app.post('/api/admin/users', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const result = await pool.query(
      `SELECT id, telegram_id, max_id, platform, username, first_name, last_name, company, company_type, phone,
              is_registered, is_admin, can_manage_bookings, approval_status, balance, gold_balance, xp_points, deals_closed, avatar_url, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (e) { console.error('Admin users error:', e); res.status(500).json({ error: 'Server error' }); }
});

app.patch('/api/admin/users/:id/roles', async (req, res) => {
  try {
    const adminUser = await resolveDbUser(req.body.initData);
    if (!adminUser?.is_admin) return res.status(403).json({ error: 'Forbidden' });
    if (String(req.params.id) === String(adminUser.id) && req.body.is_admin === false) {
      return res.status(400).json({ error: 'Нельзя снять полный админ-доступ у самого себя' });
    }

    const sets = [];
    const vals = [];
    let idx = 1;
    if (typeof req.body.is_admin === 'boolean') {
      sets.push(`is_admin = $${idx++}`);
      vals.push(req.body.is_admin);
    }
    if (typeof req.body.can_manage_bookings === 'boolean') {
      sets.push(`can_manage_bookings = $${idx++}`);
      vals.push(req.body.can_manage_bookings);
    }
    if (!sets.length) return res.status(400).json({ error: 'No roles to update' });

    vals.push(req.params.id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ success: true });
  } catch (e) {
    console.error('Update roles error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const adminUser = await resolveDbUser(req.body.initData);
    if (!adminUser?.is_admin) return res.status(403).json({ error: 'Forbidden' });
    if (String(req.params.id) === String(adminUser.id)) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    const userId = req.params.id;
    await withTransaction(async (client) => {
      // Освобождаем квартиры из активных бронирований этого пользователя
      const activeBookings = await client.query("SELECT unit_id FROM bookings WHERE user_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'", [userId]);
      for (const b of activeBookings.rows) {
        await client.query("UPDATE units SET status = 'FREE' WHERE id = $1 AND status = 'BOOKED'", [b.unit_id]);
      }
      // Удаляем связанные записи
      await client.query('DELETE FROM user_missions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM quest_completions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM bookings WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM orders WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM event_registrations WHERE user_id = $1', [userId]);
      // Удаляем пользователя
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });
    console.log(`🗑 Пользователь id=${userId} удалён (включая бронирования, миссии, заказы)`);
    res.json({ success: true });
  } catch (e) { console.error('Delete user error:', e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/clear-users', async (req, res) => {
  try {
    if (process.env.ALLOW_CLEAR_USERS !== 'true') return res.status(404).json({ error: 'Not found' });
    if (req.body.confirmation !== 'DELETE_ALL_USERS') return res.status(400).json({ error: 'Confirmation required' });
    const adminUser = await resolveDbUser(req.body.initData);
    if (!adminUser?.is_admin) return res.status(403).json({ error: 'Forbidden' });
    const result = await pool.query('DELETE FROM users WHERE id != $1', [adminUser.id]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: ЛИДЕРБОРД
// =============================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { period } = req.query;
    if (period === 'month' || period === 'quarter') {
      const dateFilter = period === 'month'
        ? `AND b.created_at >= date_trunc('month', CURRENT_DATE)`
        : `AND b.created_at >= date_trunc('quarter', CURRENT_DATE)`;
      const result = await pool.query(`
        SELECT u.id, u.telegram_id, u.first_name as name, u.last_name, u.company,
          COUNT(b.id)::int as deals, u.xp_points as xp
        FROM users u
        LEFT JOIN bookings b ON b.user_id = u.id AND b.stage = 'COMPLETE' ${dateFilter}
        WHERE u.is_registered = TRUE
        GROUP BY u.id
        HAVING COUNT(b.id) > 0
        ORDER BY deals DESC, u.xp_points DESC LIMIT 50
      `);
      res.json(result.rows);
    } else {
      const result = await pool.query(`
        SELECT id, telegram_id, first_name as name, last_name, company,
          deals_closed as deals, xp_points as xp
        FROM users WHERE is_registered = TRUE
        ORDER BY deals_closed DESC, xp_points DESC LIMIT 50
      `);
      res.json(result.rows);
    }
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: КВЕСТЫ
// =============================================
app.get('/api/quests', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      const result = await pool.query('SELECT * FROM quests WHERE is_active = TRUE ORDER BY type');
      return res.json(result.rows.map(q => ({ ...q, isCompleted: false })));
    }
    const result = await pool.query(`
      SELECT q.*, CASE WHEN qc.id IS NOT NULL THEN true ELSE false END as "isCompleted"
      FROM quests q
      LEFT JOIN quest_completions qc ON q.id = qc.quest_id AND qc.user_id = $1 AND DATE(qc.completed_at) = CURRENT_DATE
      WHERE q.is_active = TRUE ORDER BY q.type
    `, [userId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/quests/claim', async (req, res) => {
  const { initData, questId } = req.body;
  try {
    const user = await resolveDbUser(initData);
    if (!user) return res.status(401).json({ error: 'Invalid signature' });
    const questRes = await pool.query('SELECT * FROM quests WHERE id = $1 AND is_active = TRUE', [questId]);
    if (questRes.rows.length === 0) return res.status(404).json({ error: 'Quest not found' });
    const quest = questRes.rows[0];
    const checkRes = await pool.query('SELECT id FROM quest_completions WHERE user_id = $1 AND quest_id = $2 AND DATE(completed_at) = CURRENT_DATE', [user.id, questId]);
    if (checkRes.rows.length > 0) return res.status(400).json({ error: 'Квест уже выполнен сегодня' });

    await withTransaction(async (client) => {
      await client.query('INSERT INTO quest_completions (user_id, quest_id) VALUES ($1, $2)', [user.id, questId]);
      if (quest.reward_currency === 'GOLD') {
        await client.query('UPDATE users SET gold_balance = gold_balance + $1, xp_points = xp_points + $2 WHERE id = $3', [quest.reward_amount, quest.reward_xp, user.id]);
      } else {
        await client.query('UPDATE users SET balance = balance + $1, xp_points = xp_points + $2 WHERE id = $3', [quest.reward_amount, quest.reward_xp, user.id]);
      }
    });
    const updatedUser = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    res.json({ success: true, user: updatedUser.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/quests', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { type, title, reward_xp, reward_amount, reward_currency } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });
    await pool.query('INSERT INTO quests (type, title, reward_xp, reward_amount, reward_currency) VALUES ($1, $2, $3, $4, $5)', [type, title, reward_xp || 0, reward_amount || 0, reward_currency || 'SILVER']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/quests/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('UPDATE quests SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: НАСТРОЙКИ ПРИЛОЖЕНИЯ
// =============================================
app.get('/api/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM app_settings');
    const settings = {};
    for (const row of result.rows) settings[row.key] = row.value;
    res.json(settings);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/settings', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { key, value } = req.body;
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value required' });
    await pool.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, String(value)]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: СТАТИСТИКА
// =============================================
app.get('/api/statistics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name,
        COUNT(CASE WHEN u.status = 'SOLD' THEN 1 END)::int as sales,
        COUNT(u.id)::int as total_units
      FROM projects p LEFT JOIN units u ON p.id = u.project_id
      GROUP BY p.id, p.name ORDER BY p.name
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// AmoCRM sync
// =============================================
// Кэш воронок и кастомных полей AmoCRM (заполняется при старте)
let amocrmPipelineCache = { pipelineId: null, statusId: null };
let amocrmFieldsCache = {}; // { 'метраж': fieldId, 'этаж': fieldId, ... }
let amocrmDriveUrlCache = null;

const AMOCRM_FILE_UPLOAD_TIMEOUT_MS = parseInt(process.env.AMOCRM_FILE_UPLOAD_TIMEOUT_MS || '20000', 10);

async function fetchWithTimeout(url, options = {}, timeoutMs = AMOCRM_FILE_UPLOAD_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function safeAmoFileName(file, fallbackPrefix = 'file') {
  const rawName = String(file?.originalname || `${fallbackPrefix}-${Date.now()}`).trim();
  return rawName.replace(/[^\wа-яА-ЯёЁ.\- ()]/g, '_').slice(0, 180) || `${fallbackPrefix}-${Date.now()}`;
}

function isAmoCRMFileUploadEnabled() {
  return process.env.AMOCRM_ATTACH_FILES !== 'false';
}

function resolveAmoUrl(url, baseUrl) {
  if (!url) return url;
  return /^https?:\/\//i.test(url) ? url : new URL(url, baseUrl).toString();
}

async function getAmoCRMDriveUrl() {
  if (process.env.AMOCRM_DRIVE_URL) return process.env.AMOCRM_DRIVE_URL.replace(/\/$/, '');
  if (amocrmDriveUrlCache) return amocrmDriveUrlCache;

  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN) return null;

  try {
    const response = await fetchWithTimeout(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/account?with=drive_url`, {
      headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}` },
    });
    const data = await readJsonResponse(response);
    if (response.ok && data.drive_url) {
      amocrmDriveUrlCache = String(data.drive_url).replace(/\/$/, '');
      return amocrmDriveUrlCache;
    }
    console.warn('⚠️ AmoCRM drive_url не получен, используем домен аккаунта:', data);
  } catch (e) {
    console.warn('⚠️ AmoCRM drive_url lookup error:', e.message);
  }

  amocrmDriveUrlCache = `https://${AMOCRM_SUBDOMAIN}.amocrm.ru`;
  return amocrmDriveUrlCache;
}

async function uploadFileToAmoCRM(file, fallbackPrefix = 'file') {
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_TOKEN || !file?.buffer?.length || !isAmoCRMFileUploadEnabled()) return null;

  const driveUrl = await getAmoCRMDriveUrl();
  if (!driveUrl) return null;

  const fileName = safeAmoFileName(file, fallbackPrefix);
  const contentType = file.mimetype || 'application/octet-stream';
  const sessionResponse = await fetchWithTimeout(`${driveUrl}/v1.0/sessions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: fileName,
      file_size: file.buffer.length,
      content_type: contentType,
      with_preview: contentType.startsWith('image/'),
    }),
  });
  const sessionData = await readJsonResponse(sessionResponse);
  if (!sessionResponse.ok || !sessionData.upload_url) {
    throw new Error(`AmoCRM file session failed: ${sessionResponse.status} ${JSON.stringify(sessionData)}`);
  }

  let uploadUrl = resolveAmoUrl(sessionData.upload_url, driveUrl);
  const maxPartSize = Number(sessionData.max_part_size) > 0 ? Number(sessionData.max_part_size) : 512 * 1024;
  let uploadedFile = null;

  for (let offset = 0; offset < file.buffer.length; offset += maxPartSize) {
    const chunk = file.buffer.subarray(offset, Math.min(offset + maxPartSize, file.buffer.length));
    const partResponse = await fetchWithTimeout(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/octet-stream' },
      body: chunk,
    });
    const partData = await readJsonResponse(partResponse);
    if (!partResponse.ok) {
      throw new Error(`AmoCRM file upload failed: ${partResponse.status} ${JSON.stringify(partData)}`);
    }
    if (partData.next_url) {
      uploadUrl = resolveAmoUrl(partData.next_url, driveUrl);
    }
    if (partData.uuid) {
      uploadedFile = { ...partData, original_name: fileName };
    }
  }

  if (!uploadedFile?.uuid) {
    throw new Error(`AmoCRM file upload did not return uuid for ${fileName}`);
  }
  return uploadedFile;
}

async function addAmoCRMLeadNote(leadId, note) {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN || !leadId) return null;

  const response = await fetchWithTimeout(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/${leadId}/notes`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([note]),
  });
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`AmoCRM note failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function bindFilesToAmoCRMLead(leadId, files) {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  const payload = files.filter(f => f?.uuid).map(f => ({ file_uuid: f.uuid }));
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN || !leadId || payload.length === 0) return null;

  const response = await fetchWithTimeout(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/${leadId}/files`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 202) return { ok: true };
  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(`AmoCRM file bind failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function fetchAmoCRMPipelines() {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN) return;
  try {
    const res = await fetch(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/pipelines`, {
      headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}` }
    });
    if (!res.ok) { console.error('❌ AmoCRM pipelines error:', res.status); return; }
    const data = await res.json();
    const pipelines = data?._embedded?.pipelines || [];
    console.log('📋 AmoCRM воронки:');
    for (const p of pipelines) {
      console.log(`  Воронка: "${p.name}" (ID: ${p.id})`);
      const statuses = p?._embedded?.statuses || [];
      for (const s of statuses) {
        console.log(`    Этап: "${s.name}" (ID: ${s.id})`);
        // Ищем этап "устная бронь" (регистронезависимо)
        if (s.name.toLowerCase().includes('устн') && s.name.toLowerCase().includes('бронь')) {
          amocrmPipelineCache = { pipelineId: p.id, statusId: s.id };
          console.log(`    ✅ Найден этап для бронирования: "${s.name}" (pipeline=${p.id}, status=${s.id})`);
        }
      }
    }
    if (!amocrmPipelineCache.statusId) {
      console.warn('⚠️ Этап "Устная бронь" не найден в AmoCRM. Лиды будут создаваться в дефолтном этапе.');
    }
  } catch (e) { console.error('❌ AmoCRM pipelines fetch error:', e.message); }
}

async function fetchAmoCRMCustomFields() {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN) return;
  try {
    const res = await fetch(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/custom_fields?limit=50`, {
      headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}` }
    });
    if (!res.ok) { console.error('❌ AmoCRM custom fields error:', res.status); return; }
    const data = await res.json();
    const fields = data?._embedded?.custom_fields || [];
    console.log('📋 AmoCRM кастомные поля лида:');
    for (const f of fields) {
      const key = f.name.toLowerCase().trim();
      amocrmFieldsCache[key] = { id: f.id, type: f.type, name: f.name };
      console.log(`  "${f.name}" (ID: ${f.id}, type: ${f.type})`);
    }
  } catch (e) { console.error('❌ AmoCRM fields fetch error:', e.message); }
}

function buildAmoCRMCustomFields(unitData, projectName) {
  const fields = [];
  const fc = amocrmFieldsCache;
  const area = parseFloat(unitData.area) || 0;
  const price = parseInt(unitData.price) || 0;
  const pricePerSqm = area > 0 ? Math.round(price / area * 100) / 100 : 0;

  // Маппинг: название поля в AmoCRM (lowercase) → значение
  const mapping = {
    'метраж': area,
    'метраж, м2': area,
    'площадь': area,
    'этаж': parseInt(unitData.floor) || 0,
    'номер помещения': unitData.number || '',
    'цена за м2': pricePerSqm,
    'цена за м²': pricePerSqm,
    'подъезд': unitData.section || '',
    'секция': unitData.section || '',
    'тип помещения': 'Квартира',
    'дом': projectName || unitData.project_id || '',
    'жк': projectName || '',
    'id помещения': unitData.id || '',
  };

  for (const [key, value] of Object.entries(mapping)) {
    if (fc[key] && value !== '' && value !== 0 && value !== null && value !== undefined) {
      const field = fc[key];
      let fieldValue;
      if (field.type === 'numeric') {
        fieldValue = typeof value === 'number' ? value : parseFloat(value) || 0;
      } else {
        fieldValue = String(value);
      }
      fields.push({ field_id: field.id, values: [{ value: fieldValue }] });
    }
  }
  return fields.length > 0 ? fields : undefined;
}

async function syncToAmoCRM(booking, userData, unitData) {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN) { console.warn('⚠️ AmoCRM не настроен.'); return null; }

  // Защита от дубликатов: если лид уже создан для этого бронирования — не создаём повторно
  if (booking.amocrm_lead_id) {
    console.log(`⏩ AmoCRM: лид уже существует (ID=${booking.amocrm_lead_id}), пропускаем создание`);
    return booking.amocrm_lead_id;
  }
  // Двойная проверка из БД (на случай race condition)
  try {
    const check = await pool.query('SELECT amocrm_lead_id FROM bookings WHERE id = $1', [booking.id]);
    if (check.rows[0]?.amocrm_lead_id) {
      console.log(`⏩ AmoCRM: лид найден в БД (ID=${check.rows[0].amocrm_lead_id}), пропускаем`);
      return check.rows[0].amocrm_lead_id;
    }
  } catch {}

  try {
    // Получаем имя проекта
    let projectName = unitData.project_id || '';
    try {
      const projRes = await pool.query('SELECT name FROM projects WHERE id = $1', [unitData.project_id]);
      if (projRes.rows.length > 0) projectName = projRes.rows[0].name;
    } catch {}

    const customFields = buildAmoCRMCustomFields(unitData, projectName);
    const leadData = [{
      name: `Бронь: кв.${unitData.number}, ${unitData.rooms}-к, ${unitData.area}м², эт.${unitData.floor} — ${projectName}`,
      price: parseInt(unitData.price) || 0,
      ...(amocrmPipelineCache.pipelineId && { pipeline_id: amocrmPipelineCache.pipelineId }),
      ...(amocrmPipelineCache.statusId && { status_id: amocrmPipelineCache.statusId }),
      ...(customFields && { custom_fields_values: customFields }),
      _embedded: { contacts: [{ first_name: userData.first_name || '', custom_fields_values: [{ field_code: 'PHONE', values: [{ value: userData.phone || '' }] }] }] }
    }];
    console.log(`📤 AmoCRM: отправка лида в ${AMOCRM_SUBDOMAIN}.amocrm.ru...`);
    const response = await fetch(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/complex`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData)
    });
    const responseText = await response.text();
    if (!response.ok) {
      console.error(`❌ AmoCRM error ${response.status}: ${responseText}`);
      return null;
    }
    const result = JSON.parse(responseText);
    const leadId = result?.[0]?.id || null;
    console.log(`✅ AmoCRM лид создан: ID=${leadId}`);
    return leadId;
  } catch (e) { console.error('❌ AmoCRM sync error:', e.message); return null; }
}

// Прикрепить примечание и файлы к лиду в AmoCRM.
// Ошибки по файлам не блокируют бронь: почта остаётся резервным каналом.
async function attachNoteToAmoCRM(leadId, text, files = [], fallbackPrefix = 'document') {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN || !leadId) return;
  const fileList = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
  try {
    await addAmoCRMLeadNote(leadId, { note_type: 'common', params: { text } });
    console.log(`📎 AmoCRM: примечание добавлено к лиду ${leadId}`);

    if (!fileList.length || !isAmoCRMFileUploadEnabled()) return;

    const uploadedFiles = [];
    for (const file of fileList) {
      try {
        const uploaded = await uploadFileToAmoCRM(file, fallbackPrefix);
        if (uploaded?.uuid) uploadedFiles.push(uploaded);
      } catch (e) {
        console.error(`AmoCRM file upload error (${file?.originalname || 'file'}):`, e.message);
      }
    }

    if (!uploadedFiles.length) return;

    try {
      await bindFilesToAmoCRMLead(leadId, uploadedFiles);
    } catch (e) {
      console.error('AmoCRM file bind error:', e.message);
    }

    for (const file of uploadedFiles) {
      try {
        await addAmoCRMLeadNote(leadId, {
          note_type: 'attachment',
          params: {
            file_uuid: file.uuid,
            ...(file.version_uuid && { version_uuid: file.version_uuid }),
            file_name: file.original_name || file.name || fallbackPrefix,
          },
        });
        console.log(`📎 AmoCRM: файл прикреплён к лиду ${leadId}: ${file.original_name || file.name || file.uuid}`);
      } catch (e) {
        console.error(`AmoCRM attachment note error (${file.uuid}):`, e.message);
      }
    }
  } catch (e) { console.error('AmoCRM note error:', e.message); }
}

// =============================================
// API: СОБЫТИЯ (Календарь)
// =============================================

// Список событий (публичный, с учётом регистрации юзера)
app.post('/api/events/list', async (req, res) => {
  try {
    const { initData } = req.body || {};
    let userId = null;
    if (initData) {
      const dbUser = await resolveDbUser(initData);
      if (dbUser) userId = dbUser.id;
    }
    let result;
    if (userId) {
      // Показываем: все публичные + приватные, на которые пользователь приглашён
      result = await pool.query(`
        SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id)::int as spots_taken,
          EXISTS(SELECT 1 FROM event_registrations WHERE event_id = e.id AND user_id = $1) as is_registered
        FROM events e
        WHERE e.is_private = FALSE
           OR EXISTS(SELECT 1 FROM event_invitations WHERE event_id = e.id AND user_id = $1)
        ORDER BY e.date ASC, e.time ASC
      `, [userId]);
    } else {
      result = await pool.query(`
        SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id)::int as spots_taken,
          false as is_registered
        FROM events e WHERE e.is_private = FALSE ORDER BY e.date ASC, e.time ASC
      `);
    }
    res.json(result.rows);
  } catch (e) { console.error('Events list error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Создать событие (админ)
app.post('/api/events', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, date, time, type, spots_total, is_private, rsvp_deadline, invited_user_ids } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'title and date required' });
    const eventRes = await pool.query(
      'INSERT INTO events (title, description, date, time, type, spots_total, is_private, rsvp_deadline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [title, description || '', date, time || '10:00', type || 'TOUR', spots_total || 30, is_private || false, rsvp_deadline || null]);
    const eventId = eventRes.rows[0].id;
    // Добавляем приглашения для приватного события
    if (is_private && Array.isArray(invited_user_ids) && invited_user_ids.length > 0) {
      for (const uid of invited_user_ids) {
        await pool.query('INSERT INTO event_invitations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, uid]);
      }
    }
    const recipientsRes = is_private
      ? await pool.query(
          `SELECT telegram_id, max_id, platform FROM users
           WHERE id = ANY($1::int[]) AND is_registered = TRUE AND approval_status = 'approved'`,
          [Array.isArray(invited_user_ids) ? invited_user_ids : []]
        )
      : await pool.query(
          `SELECT telegram_id, max_id, platform FROM users
           WHERE is_registered = TRUE AND approval_status = 'approved'`
        );
    const eventDate = new Date(date).toLocaleDateString('ru-RU');
    const eventText = `📅 <b>Новое событие</b>\n\n<b>${title}</b>\n${description ? `${description}\n` : ''}📍 ${eventDate}${time ? ` в ${time}` : ''}\n👥 Мест: ${spots_total || 30}`;
    for (const u of recipientsRes.rows) {
      notifyUser(u, eventText, getAppOpenKeyboard());
    }
    res.json({ success: true, eventId });
  } catch (e) { console.error('Create event error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Редактировать событие (админ)
app.put('/api/events/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, date, time, type, spots_total, is_private, rsvp_deadline, invited_user_ids } = req.body;
    await pool.query('UPDATE events SET title=$1, description=$2, date=$3, time=$4, type=$5, spots_total=$6, is_private=$7, rsvp_deadline=$8 WHERE id=$9',
      [title, description, date, time, type, spots_total, is_private || false, rsvp_deadline || null, req.params.id]);
    // Обновляем приглашения
    if (is_private && Array.isArray(invited_user_ids)) {
      await pool.query('DELETE FROM event_invitations WHERE event_id = $1', [req.params.id]);
      for (const uid of invited_user_ids) {
        await pool.query('INSERT INTO event_invitations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, uid]);
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Удалить событие (админ)
app.delete('/api/events/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM events WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Записаться на событие
app.post('/api/events/:id/register', async (req, res) => {
  try {
    const dbUser = await resolveDbUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    const result = await withTransaction(async (client) => {
      const eventRes = await client.query('SELECT * FROM events WHERE id = $1 FOR UPDATE', [req.params.id]);
      if (eventRes.rows.length === 0) throw { status: 404, msg: 'Event not found' };
      const event = eventRes.rows[0];
      if (event.rsvp_deadline && new Date() > new Date(event.rsvp_deadline)) {
        throw { status: 400, msg: 'Время регистрации истекло' };
      }
      if (event.is_private) {
        const inviteRes = await client.query('SELECT 1 FROM event_invitations WHERE event_id = $1 AND user_id = $2', [event.id, dbUser.id]);
        if (inviteRes.rows.length === 0) throw { status: 403, msg: 'Это закрытое событие' };
      }
      const existingRes = await client.query('SELECT 1 FROM event_registrations WHERE event_id = $1 AND user_id = $2', [event.id, dbUser.id]);
      if (existingRes.rows.length > 0) return { event, created: false };
      const countRes = await client.query('SELECT COUNT(*) FROM event_registrations WHERE event_id = $1', [event.id]);
      if (parseInt(countRes.rows[0].count) >= event.spots_total) throw { status: 400, msg: 'Мест нет' };
      await client.query('INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2)', [event.id, dbUser.id]);
      return { event, created: true };
    });
    if (result.created) {
      notifyUser(dbUser, `✅ Вы записаны на <b>${result.event.title}</b>!\n📅 ${result.event.date} в ${result.event.time || ''}`);
    }
    res.json({ success: true, alreadyRegistered: !result.created });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.msg });
    console.error('Event register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Отменить участие в событии
app.post('/api/events/:id/unregister', async (req, res) => {
  try {
    const dbUser = await resolveDbUser(req.body.initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    await pool.query('DELETE FROM event_registrations WHERE event_id = $1 AND user_id = $2', [req.params.id, dbUser.id]);
    res.json({ success: true });
  } catch (e) { console.error('Event unregister error:', e); res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: ИПОТЕЧНЫЕ ПРОГРАММЫ
// =============================================

// Список активных программ (публичный)
app.get('/api/mortgage-programs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mortgage_programs WHERE is_active = TRUE ORDER BY rate ASC');
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Создать программу (админ)
app.post('/api/mortgage-programs', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { name, rate, min_payment, max_term, description } = req.body;
    if (!name || !rate) return res.status(400).json({ error: 'name and rate required' });
    await pool.query('INSERT INTO mortgage_programs (name, rate, min_payment, max_term, description) VALUES ($1,$2,$3,$4,$5)',
      [name, rate, min_payment || 10, max_term || 30, description || '']);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Редактировать программу (админ)
app.put('/api/mortgage-programs/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { name, rate, min_payment, max_term, description } = req.body;
    await pool.query('UPDATE mortgage_programs SET name=$1, rate=$2, min_payment=$3, max_term=$4, description=$5 WHERE id=$6',
      [name, rate, min_payment, max_term, description, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Удалить программу (админ)
app.delete('/api/mortgage-programs/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('UPDATE mortgage_programs SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// МИССИИ — автоматическая проверка и начисление
// =============================================

// Инициализировать записи user_missions для пользователя (если ещё нет)
async function ensureUserMissions(userId) {
  await pool.query(`
    INSERT INTO user_missions (user_id, mission_id, progress, completed, rewarded)
    SELECT $1, m.id, 0, FALSE, FALSE FROM missions m
    WHERE NOT EXISTS (SELECT 1 FROM user_missions um WHERE um.user_id = $1 AND um.mission_id = m.id)
  `, [userId]);
}

// Проверить и обновить прогресс миссий + начислить награды
async function checkMissions(userId, trigger) {
  try {
    await ensureUserMissions(userId);
    const missions = await pool.query('SELECT * FROM missions');
    const userMissions = await pool.query('SELECT * FROM user_missions WHERE user_id = $1', [userId]);
    const umMap = {};
    userMissions.rows.forEach(um => { umMap[um.mission_id] = um; });

    const rewards = []; // {mission, amount, currency}

    for (const m of missions.rows) {
      const um = umMap[m.id];
      if (!um || um.completed) continue;

      let newProgress = um.progress;

      // --- Вычисляем прогресс для каждого типа миссии ---
      if (['first_booking', 'bookings_5', 'bookings_10', 'bookings_25'].includes(m.code) && (trigger === 'booking' || trigger === 'init')) {
        const countRes = await pool.query("SELECT count(*) FROM bookings WHERE user_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'", [userId]);
        newProgress = parseInt(countRes.rows[0].count);
      }

      if (['multi_project', 'all_projects'].includes(m.code) && (trigger === 'booking' || trigger === 'init')) {
        const projRes = await pool.query("SELECT count(DISTINCT project_id) FROM bookings WHERE user_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'", [userId]);
        newProgress = parseInt(projRes.rows[0].count);
      }

      if (m.code === 'profile_complete' && (trigger === 'register' || trigger === 'init')) {
        const userRes = await pool.query('SELECT first_name, last_name, phone, company FROM users WHERE id = $1', [userId]);
        const u = userRes.rows[0];
        if (u && u.first_name && u.last_name && u.phone && u.company) {
          newProgress = 1;
        }
      }

      if (['login_streak_7', 'login_streak_30'].includes(m.code) && (trigger === 'login' || trigger === 'init')) {
        const streakRes = await pool.query('SELECT login_streak FROM users WHERE id = $1', [userId]);
        newProgress = parseInt(streakRes.rows[0]?.login_streak || 0);
      }

      // --- Обновляем прогресс ---
      if (newProgress !== um.progress) {
        await pool.query('UPDATE user_missions SET progress = $1 WHERE user_id = $2 AND mission_id = $3', [newProgress, userId, m.id]);
      }

      // --- Если достиг цели — завершить и начислить ---
      if (newProgress >= m.target_count && !um.completed) {
        await pool.query(
          'UPDATE user_missions SET completed = TRUE, completed_at = NOW(), rewarded = TRUE, progress = $1 WHERE user_id = $2 AND mission_id = $3',
          [newProgress, userId, m.id]
        );
        // Начислить награду
        const balField = m.reward_currency === 'GOLD' ? 'gold_balance' : 'balance';
        await pool.query(`UPDATE users SET ${balField} = ${balField} + $1 WHERE id = $2`, [m.reward_amount, userId]);
        rewards.push({ code: m.code, title: m.title, amount: m.reward_amount, currency: m.reward_currency });
        console.log(`🏆 Миссия "${m.title}" выполнена! User=${userId}, +${m.reward_amount} ${m.reward_currency}`);
      }
    }
    return rewards;
  } catch (e) {
    console.error('checkMissions error:', e);
    return [];
  }
}

// API: Получить миссии пользователя с прогрессом
app.post('/api/missions', async (req, res) => {
  try {
    const { initData } = req.body;
    const dbUser = await resolveDbUser(initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    const userId = dbUser.id;

    await ensureUserMissions(userId);
    const result = await pool.query(`
      SELECT m.id, m.code, m.title, m.description, m.reward_amount, m.reward_currency,
             m.target_count, m.category, m.icon, m.sort_order,
             um.progress, um.completed, um.completed_at
      FROM missions m
      LEFT JOIN user_missions um ON um.mission_id = m.id AND um.user_id = $1
      ORDER BY m.sort_order
    `, [userId]);
    res.json(result.rows);
  } catch (e) {
    console.error('Missions error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// =============================================
// БРОНИРОВАНИЕ (с транзакцией + уникальность)
// =============================================

// Шаг 0: Создать бронь (с FOR UPDATE + проверка уникальности)
app.post('/api/bookings', async (req, res) => {
  const { initData, unitId, projectId } = req.body;
  try {
    const user = await resolveDbUser(initData);
    if (!user) return res.status(401).json({ error: 'Invalid signature' });
    if (!user.is_registered) return res.status(400).json({ error: 'Сначала зарегистрируйтесь' });

    const freshFeed = await refreshFeedBeforeBooking(unitId, projectId);
    if (!freshFeed.ok) return res.status(freshFeed.status || 503).json({ error: freshFeed.msg || 'Не удалось обновить фид' });

    const result = await withTransaction(async (client) => {
      // Блокируем строку квартиры
      const unitRes = await client.query('SELECT * FROM units WHERE id = $1 FOR UPDATE', [unitId]);
      if (unitRes.rows.length === 0) throw { status: 404, msg: 'Unit not found' };
      const unit = unitRes.rows[0];
      if (unit.status !== 'FREE') throw { status: 400, msg: 'Квартира уже забронирована или продана' };
      // Проверка: нет ли активного бронирования
      const existing = await client.query("SELECT id FROM bookings WHERE unit_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'", [unitId]);
      if (existing.rows.length > 0) throw { status: 400, msg: 'На эту квартиру уже есть активное бронирование' };
      const bookingRes = await client.query(
        `INSERT INTO bookings (user_id, unit_id, project_id, user_phone, user_name, user_company, stage)
         VALUES ($1, $2, $3, $4, $5, $6, 'INIT') RETURNING *`,
        [user.id, unitId, unit.project_id || projectId, user.phone, user.first_name, user.company]
      );
      await client.query("UPDATE units SET status = 'BOOKED' WHERE id = $1", [unitId]);
      return { success: true, bookingId: bookingRes.rows[0].id };
    });
    // Автопроверка миссий (асинхронно, не блокирует ответ)
    checkMissions(user.id, 'booking').then(rewards => {
      if (rewards.length > 0) console.log(`🎯 Миссии после бронирования user=${user.id}:`, rewards.map(r => r.title).join(', '));
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.msg });
    if (e.code === '23505' && e.constraint === 'idx_bookings_one_active_per_unit') {
      return res.status(409).json({ error: 'На эту квартиру уже есть активное бронирование' });
    }
    console.error('Booking error:', e);
    res.status(500).json({ error: 'Booking error' });
  }
});

// Шаг 1: Загрузка паспорта → квартира BOOKED
app.post('/api/bookings/:id/passport', upload.single('passport'), async (req, res) => {
  try {
    const { initData, buyerName, buyerPhone, consentTransfer } = req.body;
    const dbUser = await resolveDbUser(initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });

    const bookingRes = await pool.query('SELECT b.*, u.first_name as agent_name, u.phone as agent_phone, u.company as agent_company FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    if (dbUser.id !== booking.user_id) return res.status(403).json({ error: 'Not your booking' });
    if (booking.passport_sent) return res.status(400).json({ error: 'Паспорт уже отправлен' });

    const unitRes = await pool.query('SELECT * FROM units WHERE id = $1', [booking.unit_id]);
    const unit = unitRes.rows[0] || {};

    const files = req.file ? [req.file] : [];
    const emailSent = await sendDocumentEmail(
      `📋 Паспорт покупателя — Кв.${unit.number}, ${booking.project_id}`, files,
      { agentName: booking.agent_name, agentPhone: booking.agent_phone, agentCompany: booking.agent_company,
        buyerName: buyerName || '', buyerPhone: buyerPhone || '',
        unitNumber: unit.number, unitFloor: unit.floor, unitPrice: unit.price, projectId: booking.project_id }
    );

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE bookings SET passport_sent = TRUE, passport_sent_at = NOW(), buyer_name = $1, buyer_phone = $2, stage = 'PASSPORT_SENT', consent_transfer = $3, consent_transfer_at = CASE WHEN $3 THEN NOW() ELSE NULL END WHERE id = $4`,
        [buyerName, buyerPhone, consentTransfer === 'true' || consentTransfer === true, req.params.id]
      );
      await client.query(`UPDATE units SET status = 'BOOKED' WHERE id = $1`, [booking.unit_id]);
    });

    // AmoCRM: создаём лид при загрузке паспорта (когда есть все данные покупателя)
    console.log(`🔖 [PASSPORT endpoint] booking #${booking.id}: вызываю syncToAmoCRM`);
    const userFull = await pool.query('SELECT * FROM users WHERE id = $1', [booking.user_id]);
    // Перечитываем booking из БД — может уже быть amocrm_lead_id (от параллельного вызова)
    const freshBooking = await pool.query('SELECT * FROM bookings WHERE id = $1', [booking.id]);
    const bookingForCRM = { ...booking, amocrm_lead_id: freshBooking.rows[0]?.amocrm_lead_id || booking.amocrm_lead_id };
    const passportFile = req.file || null;
    syncToAmoCRM(bookingForCRM, userFull.rows[0], unit).then(async (leadId) => {
      if (leadId) {
        await pool.query('UPDATE bookings SET amocrm_lead_id = $1, amocrm_synced = TRUE WHERE id = $2', [String(leadId), booking.id]);
        const noteText = `📋 Данные бронирования\n\n` +
          `🏠 Квартира: №${unit.number}, этаж ${unit.floor}, ${unit.rooms}-к, ${unit.area} м²\n` +
          `💰 Цена: ${Number(unit.price).toLocaleString('ru-RU')} ₽\n` +
          `📁 Проект: ${booking.project_id}\n\n` +
          `👤 Покупатель: ${buyerName || '—'}\n📞 Телефон покупателя: ${buyerPhone || '—'}\n\n` +
          `🤝 Риелтор: ${booking.agent_name} (${booking.agent_company})\n📞 Телефон риелтора: ${booking.agent_phone}\n\n` +
          `📎 Паспорт: ${passportFile ? passportFile.originalname : 'отправлен на email'}`;
        await attachNoteToAmoCRM(leadId, noteText, passportFile ? [passportFile] : [], 'passport');
      }
    }).catch(e => console.error('AmoCRM error:', e));

    res.json({ success: true, emailSent, stage: 'PASSPORT_SENT' });
  } catch (e) {
    console.error('Passport upload error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Шаг 2: Загрузка пакета документов для ипотеки
app.post('/api/bookings/:id/documents', upload.array('documents', 10), async (req, res) => {
  try {
    const { initData } = req.body;
    const dbUser = await resolveDbUser(initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });

    const bookingRes = await pool.query('SELECT b.*, u.first_name as agent_name, u.phone as agent_phone, u.company as agent_company FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    if (dbUser.id !== booking.user_id) return res.status(403).json({ error: 'Not your booking' });
    if (!booking.passport_sent) return res.status(400).json({ error: 'Сначала отправьте паспорт' });
    if (booking.docs_sent) return res.status(400).json({ error: 'Документы уже отправлены' });

    const unitRes = await pool.query('SELECT * FROM units WHERE id = $1', [booking.unit_id]);
    const unit = unitRes.rows[0] || {};

    const files = req.files || [];
    const emailSent = await sendDocumentEmail(
      `📋 Документы для ипотеки — Кв.${unit.number}, ${booking.project_id}`, files,
      { agentName: booking.agent_name, agentPhone: booking.agent_phone, agentCompany: booking.agent_company,
        buyerName: booking.buyer_name || '', buyerPhone: booking.buyer_phone || '',
        unitNumber: unit.number, unitFloor: unit.floor, unitPrice: unit.price, projectId: booking.project_id }
    );

    await pool.query(`UPDATE bookings SET docs_sent = TRUE, docs_sent_at = NOW(), stage = 'DOCS_SENT' WHERE id = $1`, [req.params.id]);

    const userFull = await pool.query('SELECT * FROM users WHERE id = $1', [booking.user_id]);
    const freshBooking = await pool.query('SELECT * FROM bookings WHERE id = $1', [booking.id]);
    const bookingForCRM = { ...booking, amocrm_lead_id: freshBooking.rows[0]?.amocrm_lead_id || booking.amocrm_lead_id };
    syncToAmoCRM(bookingForCRM, userFull.rows[0], unit).then(async (leadId) => {
      if (leadId) {
        await pool.query('UPDATE bookings SET amocrm_lead_id = $1, amocrm_synced = TRUE WHERE id = $2', [String(leadId), booking.id]);
        const noteText = `📋 Документы для ипотеки\n\n` +
          `🏠 Квартира: №${unit.number}, этаж ${unit.floor}, ${unit.rooms}-к, ${unit.area} м²\n` +
          `💰 Цена: ${Number(unit.price).toLocaleString('ru-RU')} ₽\n` +
          `📁 Проект: ${booking.project_id}\n\n` +
          `👤 Покупатель: ${booking.buyer_name || '—'}\n📞 Телефон покупателя: ${booking.buyer_phone || '—'}\n\n` +
          `🤝 Риелтор: ${booking.agent_name} (${booking.agent_company})\n📞 Телефон риелтора: ${booking.agent_phone}\n\n` +
          `📎 Файлы: ${files.length ? files.map(f => f.originalname).join(', ') : 'нет файлов'}`;
        await attachNoteToAmoCRM(leadId, noteText, files, 'mortgage-documents');
      }
    }).catch(e => console.error('AmoCRM documents error:', e));

    // Квартира остаётся BOOKED, deals_closed НЕ увеличивается
    // Сделка подтверждается админом через /api/bookings/:id/complete
    res.json({ success: true, emailSent, stage: 'DOCS_SENT' });
  } catch (e) {
    console.error('Documents upload error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Подтверждение сделки (только админ) — присуждает золотую монету
app.post('/api/bookings/:id/complete', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];
    if (booking.stage === 'COMPLETE') return res.status(400).json({ error: 'Сделка уже подтверждена' });
    if (booking.stage !== 'DOCS_SENT') return res.status(400).json({ error: 'Документы ещё не отправлены' });

    await withTransaction(async (client) => {
      await client.query(`UPDATE bookings SET stage = 'COMPLETE' WHERE id = $1`, [booking.id]);
      await client.query(`UPDATE units SET status = 'SOLD' WHERE id = $1`, [booking.unit_id]);
      await client.query('UPDATE users SET deals_closed = deals_closed + 1, gold_balance = gold_balance + 1 WHERE id = $1', [booking.user_id]);
    });

    // Уведомление риелтору
    const userRes = await pool.query('SELECT telegram_id, max_id, platform, first_name FROM users WHERE id = $1', [booking.user_id]);
    if (userRes.rows[0]) {
      notifyUser(userRes.rows[0],
        `🎉 <b>Сделка подтверждена!</b>\n\nПоздравляем, ${userRes.rows[0].first_name || 'партнёр'}! Вам начислена 1 золотая монета 🪙`);
    }
    checkMissions(booking.user_id, 'booking').catch(() => {});
    console.log(`✅ Сделка подтверждена: booking=${booking.id}, user=${booking.user_id}, +1 gold`);
    res.json({ success: true, stage: 'COMPLETE' });
  } catch (e) { console.error('Complete booking error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Отмена подтверждения сделки (только админ) — отзыв золотой монеты
app.post('/api/bookings/:id/revoke', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const bookingRes = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];
    if (booking.stage !== 'COMPLETE') return res.status(400).json({ error: 'Сделка не была подтверждена' });

    await withTransaction(async (client) => {
      await client.query(`UPDATE bookings SET stage = 'DOCS_SENT' WHERE id = $1`, [booking.id]);
      await client.query(`UPDATE units SET status = 'BOOKED' WHERE id = $1`, [booking.unit_id]);
      await client.query('UPDATE users SET deals_closed = GREATEST(deals_closed - 1, 0), gold_balance = GREATEST(gold_balance - 1, 0) WHERE id = $1', [booking.user_id]);
    });

    console.log(`🔄 Сделка отозвана: booking=${booking.id}, user=${booking.user_id}, -1 gold`);
    res.json({ success: true, stage: 'DOCS_SENT' });
  } catch (e) { console.error('Revoke booking error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Мои бронирования
app.post('/api/bookings/my', async (req, res) => {
  try {
    const { initData } = req.body;
    const dbUser = await resolveDbUser(initData);
    if (!dbUser) return res.status(401).json({ error: 'Invalid signature' });
    const result = await pool.query(`
      SELECT b.*, un.number as unit_number, un.floor as unit_floor, un.area as unit_area,
             un.price as unit_price, un.rooms as unit_rooms, un.status as unit_status, p.name as project_name
      FROM bookings b LEFT JOIN units un ON b.unit_id = un.id LEFT JOIN projects p ON b.project_id = p.id
      WHERE b.user_id = $1 AND COALESCE(b.stage, 'INIT') != 'CANCELLED' ORDER BY b.created_at DESC
    `, [dbUser.id]);
    res.json(result.rows);
  } catch (e) { console.error('My bookings error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Все бронирования (админ) — ЗАЩИЩЁН
app.post('/api/bookings/all', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const result = await pool.query(`
      SELECT b.*, u.first_name, u.last_name, u.phone, u.company, un.number as unit_number, un.project_id
      FROM bookings b LEFT JOIN users u ON b.user_id = u.id LEFT JOIN units un ON b.unit_id = un.id
      ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// Снять бронь (только админ)
app.post('/api/bookings/cancel', async (req, res) => {
  try {
    const { initData, unitId } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });

    const user = await resolveDbUser(initData);
    if (!user) return res.status(401).json({ error: 'Invalid signature' });

    // Только админ может снимать бронь
    if (!user.is_admin && !user.can_manage_bookings) {
      return res.status(403).json({ error: 'Недостаточно прав для снятия брони' });
    }

    await withTransaction(async (client) => {
      await client.query("UPDATE bookings SET stage = 'CANCELLED' WHERE unit_id = $1 AND COALESCE(stage, 'INIT') != 'CANCELLED'", [unitId]);
      await client.query("UPDATE units SET status = 'FREE' WHERE id = $1", [unitId]);
    });

    console.log(`🔓 Бронь снята: unit=${unitId}, by user=${user.id} (${user.is_admin ? 'admin' : 'owner'})`);
    res.json({ success: true });
  } catch (e) { console.error('Cancel booking error:', e); res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// CATCH-ALL (SPA fallback)
// =============================================
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;

// Graceful shutdown
process.on('SIGTERM', () => { pool.end().then(() => process.exit(0)); });

// Старт: подключаемся к БД + регистрируем webhook
initDb().then(() => {
  registerWebhook();
  // Регистрируем MAX webhook (no-op если MAX_ENABLED != 'true')
  if (isMaxEnabled()) {
    registerMaxWebhook().catch(e => console.error('[MAX] webhook reg error:', e?.message || e));
    console.log('🟣 MAX platform: ENABLED');
  } else {
    console.log('⚪ MAX platform: disabled (set MAX_ENABLED=true to enable)');
  }
  fetchAmoCRMPipelines().then(() => fetchAmoCRMCustomFields());
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} | v2025-02-20-dedup`));
}).catch(err => {
  console.error('❌ Fatal: could not init DB, starting anyway...', err);
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} (DB may be unavailable)`));
});
