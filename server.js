import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';
import cron from 'node-cron';
import multer from 'multer';
import nodemailer from 'nodemailer';

// Поддержка обоих имён переменной (TELEGRAM_BOT_TOKEN в Amvera, BOT_TOKEN в коде)
if (!process.env.BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN) {
  process.env.BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Pool } = pg;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
app.use(ALLOWED_ORIGINS.length > 0 ? cors({ origin: ALLOWED_ORIGINS }) : cors());

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

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
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
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

// Универсальная авторизация: Telegram initData ИЛИ PWA-токен
async function resolveAuth(initDataOrToken) {
  if (!initDataOrToken) return null;
  // 1. Попытка: Telegram initData
  const tgUser = parseTelegramUser(initDataOrToken);
  if (tgUser) return tgUser;
  // 2. Попытка: PWA-токен
  try {
    const res = await pool.query('SELECT * FROM users WHERE pwa_token = $1', [initDataOrToken]);
    if (res.rows.length > 0) {
      const user = res.rows[0];
      return { id: user.telegram_id, username: user.username, first_name: user.first_name };
    }
  } catch (e) {
    console.error('resolveAuth pwa_token error:', e.message);
  }
  return null;
}

async function isAdmin(initData) {
  if (!initData) return false;
  try {
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return false;
    const res = await pool.query('SELECT is_admin FROM users WHERE telegram_id = $1', [tgUser.id]);
    return res.rows.length > 0 && res.rows[0].is_admin;
  } catch (e) { return false; }
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
    await pool.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS feed_url TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_points INT DEFAULT 0;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deals_closed INT DEFAULT 0;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;');
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'agency';");
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none';");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_news_at TIMESTAMP;');
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
    await pool.query('CREATE INDEX IF NOT EXISTS idx_news_date ON news(created_at);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_ev_date ON events(date);');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_evreg ON event_registrations(event_id, user_id);');

    // Сид-данные
    const projCheck = await pool.query('SELECT count(*) FROM projects');
    if (parseInt(projCheck.rows[0].count) === 0) {
      await pool.query(`INSERT INTO projects (id, name, floors, units_per_floor, image_url) VALUES ('brk', 'ЖК Бруклин', 12, 6, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00') ON CONFLICT DO NOTHING`);
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

async function syncProjectWithXml(projectId, url) {
  console.log(`🔄 Syncing ${projectId} from ${url}`);
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
  console.log(`📋 Format: ${diag.format}, items: ${rawItems.length}, keys: ${diag.firstItemKeys.join(', ')}`);
  console.log(`🔍 Sample: ${JSON.stringify(firstItem).slice(0, 1000)}`);

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
  units.slice(0, 5).forEach((u, i) => console.log(`🏠 [${i}]: fl=${u.floor} sec=${u.section} num=${u.number} rm=${u.rooms} area=${u.area} price=${u.price} statusId="${u.statusId}" statusRaw="${u.statusRaw}" img=${u.planUrl ? '✅' : '❌'}`));

  // Статистика по status_id из фида
  const feedStatusMap = {};
  for (const u of units) {
    const key = `sid=${u.statusId}|raw=${u.statusRaw.slice(0, 40)}`;
    feedStatusMap[key] = (feedStatusMap[key] || 0) + 1;
  }
  console.log('📊 Feed status distribution:', JSON.stringify(feedStatusMap));

  // Сохраняем unit_id с активными бронями ДО удаления
  const bookedRes = await pool.query(
    "SELECT DISTINCT unit_id FROM bookings WHERE project_id = $1 AND stage != 'CANCELLED'",
    [projectId]
  );
  const bookedUnitIds = new Set(bookedRes.rows.map(r => r.unit_id));
  if (bookedUnitIds.size > 0) {
    console.log(`🔒 Preserving ${bookedUnitIds.size} booked units during sync`);
  }

  await pool.query('DELETE FROM units WHERE project_id = $1', [projectId]);

  let maxFloor = buildingFloors || 1;
  const floorCounts = {};
  const floorCounters = {};
  let count = 0;

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

    await pool.query(
      `INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url, section) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET floor=$3, number=$4, rooms=$5, area=$6, price=$7, status=$8, plan_image_url=$9, section=$10, updated_at=NOW()`,
      [u.id, projectId, floor, unitNumber, u.rooms, u.area, u.price, status, u.planUrl, u.section]
    );
    count++;
  }

  const maxUnitsOnFloor = Math.max(...Object.values(floorCounts).map(Number), 1);
  await pool.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3 WHERE id = $4', [maxFloor, maxUnitsOnFloor, url, projectId]);

  // Секции
  const sections = [...new Set(units.map(u => u.section).filter(Boolean))];

  // Подсчёт сохранённых статусов из БД (после парсинга)
  const savedRes = await pool.query('SELECT status, count(*) as c FROM units WHERE project_id = $1 GROUP BY status', [projectId]);
  const savedStatuses = {};
  for (const r of savedRes.rows) savedStatuses[r.status] = parseInt(r.c);

  diag.savedCount = count;
  diag.sampleUnit = units[0] || null;
  diag.floors = maxFloor;
  diag.maxPerFloor = maxUnitsOnFloor;
  diag.sections = sections;
  diag.feedStatusMap = feedStatusMap;
  diag.savedStatuses = savedStatuses;
  console.log(`✅ Synced ${count}/${rawItems.length} for ${projectId} (${diag.format}, ${maxFloor} fl, ${maxUnitsOnFloor}/fl, sections=${sections.join(',')}, statuses=${JSON.stringify(savedStatuses)}, noFloor=${diag.noFloorCount})`);
  return diag;
}

cron.schedule('0 */2 * * *', async () => {
  try {
    const res = await pool.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
    for (const project of res.rows) {
      if (project.feed_url) await syncProjectWithXml(project.id, project.feed_url);
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
app.post('/api/auth', rateLimit(900000, 10), async (req, res) => {
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
app.post('/api/auth/token', rateLimit(900000, 10), async (req, res) => {
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
// АВАТАРКА
// =============================================
app.post('/api/avatar', async (req, res) => {
  try {
    const { initData, avatarData } = req.body;
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    if (!avatarData) return res.status(400).json({ error: 'No avatar data' });
    if (avatarData.length > 1400000) return res.status(400).json({ error: 'Image too large' });
    await pool.query('UPDATE users SET avatar_url = $1 WHERE telegram_id = $2', [avatarData, tgUser.id]);
    res.json({ success: true, avatar_url: avatarData });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// РЕГИСТРАЦИЯ С МОДЕРАЦИЕЙ
// =============================================
app.post('/api/register', async (req, res) => {
  const { initData, firstName, lastName, companyType, company, phone, consentPd } = req.body;
  try {
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    if (!consentPd) return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });
    await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, company_type = $3, company = $4, phone = $5, approval_status = 'pending', consent_pd = TRUE, consent_pd_at = NOW() WHERE telegram_id = $6`,
      [firstName, lastName, companyType || 'agency', company, phone, tgUser.id]
    );
    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    const userId = userRes.rows[0]?.id;
    const typeLabel = companyType === 'ip' ? 'ИП' : 'Агентство';
    const text = `📋 <b>Новая заявка на вход!</b>\n\n👤 ${firstName} ${lastName}\n🏢 ${typeLabel}: ${company}\n📞 ${phone}`;
    const keyboard = [[
      { text: '✅ Одобрить', callback_data: `approve_${userId}` },
      { text: '❌ Отклонить', callback_data: `reject_${userId}` }
    ]];
    notifyAdminTelegram(text, keyboard);
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
      `SELECT id, telegram_id, first_name, last_name, company_type, company, phone, created_at
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
    await pool.query(`UPDATE users SET is_registered = TRUE, approval_status = 'approved' WHERE id = $1`, [req.params.userId]);
    const userRes = await pool.query('SELECT telegram_id, first_name FROM users WHERE id = $1', [req.params.userId]);
    if (userRes.rows.length > 0) {
      const u = userRes.rows[0];
      notifyUserTelegram(u.telegram_id, `🎉 <b>Добро пожаловать в Клуб Партнёров!</b>\n\nПривет, ${u.first_name || 'партнёр'}! Ваша заявка одобрена.`);
    }
    res.json({ success: true });
  } catch (e) { console.error('Approve error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Отклонить заявку (админ)
app.post('/api/applications/:userId/reject', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    await pool.query(`UPDATE users SET approval_status = 'rejected' WHERE id = $1`, [req.params.userId]);
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
      await pool.query(`UPDATE users SET is_registered = TRUE, approval_status = 'approved' WHERE id = $1`, [userId]);
      if (BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callback.id, text: '✅ Одобрено!' })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: callback.message.chat.id, message_id: callback.message.message_id, text: callback.message.text + '\n\n✅ <b>ОДОБРЕНО</b>', parse_mode: 'HTML' })
        });
      }
    } else if (action === 'reject') {
      await pool.query(`UPDATE users SET approval_status = 'rejected' WHERE id = $1`, [userId]);
      if (BOT_TOKEN) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callback.id, text: '❌ Отклонено' })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: callback.message.chat.id, message_id: callback.message.message_id, text: callback.message.text + '\n\n❌ <b>ОТКЛОНЕНО</b>', parse_mode: 'HTML' })
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
      const usersRes = await pool.query('SELECT telegram_id FROM users WHERE is_registered = TRUE');
      const projectLabel = project_name ? ` (${project_name})` : '';
      const newsText = `📰 <b>Новая новость${projectLabel}</b>\n\n${title}\n\n${(text || '').slice(0, 150)}${(text || '').length > 150 ? '...' : ''}`;
      for (const u of usersRes.rows) { notifyUserTelegram(u.telegram_id, newsText); }
      res.json({ success: true });
    } else res.status(403).json({ error: 'Forbidden' });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/news/unread-count', async (req, res) => {
  try {
    const tgUser = await resolveAuth(req.body.initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT last_seen_news_at FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.json({ count: 0 });
    const lastSeen = userRes.rows[0].last_seen_news_at;
    let countRes;
    if (lastSeen) { countRes = await pool.query('SELECT COUNT(*) FROM news WHERE created_at > $1', [lastSeen]); }
    else { countRes = await pool.query('SELECT COUNT(*) FROM news'); }
    res.json({ count: parseInt(countRes.rows[0].count) });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/news/mark-seen', async (req, res) => {
  try {
    const tgUser = await resolveAuth(req.body.initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    await pool.query('UPDATE users SET last_seen_news_at = NOW() WHERE telegram_id = $1', [tgUser.id]);
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
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const result = await withTransaction(async (client) => {
      const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [tgUser.id]);
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
    const { name, floors, unitsPerFloor } = req.body;
    const sets = []; const vals = []; let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (floors) { sets.push(`floors = $${idx++}`); vals.push(parseInt(floors)); }
    if (unitsPerFloor) { sets.push(`units_per_floor = $${idx++}`); vals.push(parseInt(unitsPerFloor)); }
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

app.get('/api/units/:projectId', async (req, res) => {
  try {
    const result = await pool.query(`
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
        SELECT * FROM bookings WHERE unit_id = u.id AND stage != 'CANCELLED' ORDER BY created_at DESC LIMIT 1
      ) b ON u.status = 'BOOKED'
      LEFT JOIN users agent ON b.user_id = agent.id
      WHERE u.project_id = $1
    `, [req.params.projectId]);
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

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
      `SELECT id, telegram_id, username, first_name, last_name, company, company_type, phone,
              is_registered, is_admin, approval_status, balance, gold_balance, xp_points, deals_closed, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (e) { console.error('Admin users error:', e); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const tgUser = await resolveAuth(req.body.initData);
    const targetUser = await pool.query('SELECT telegram_id FROM users WHERE id = $1', [req.params.id]);
    if (targetUser.rows.length > 0 && String(targetUser.rows[0].telegram_id) === String(tgUser.id)) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    const userId = req.params.id;
    await withTransaction(async (client) => {
      // Освобождаем квартиры из активных бронирований этого пользователя
      const activeBookings = await client.query("SELECT unit_id FROM bookings WHERE user_id = $1 AND stage != 'CANCELLED'", [userId]);
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
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const tgUser = await resolveAuth(req.body.initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const result = await pool.query('DELETE FROM users WHERE telegram_id != $1', [tgUser.id]);
    res.json({ success: true, deleted: result.rowCount });
  } catch (e) { res.status(500).json({ error: 'Server error' }); }
});

// =============================================
// API: ЛИДЕРБОРД
// =============================================
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, telegram_id, first_name as name, last_name, company,
        deals_closed as deals, xp_points as xp
      FROM users WHERE is_registered = TRUE
      ORDER BY deals_closed DESC, xp_points DESC LIMIT 50
    `);
    res.json(result.rows);
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
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];
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

// Прикрепить примечание с текстом и файлом к лиду в AmoCRM
async function attachNoteToAmoCRM(leadId, text, file) {
  const AMOCRM_SUBDOMAIN = process.env.AMOCRM_SUBDOMAIN;
  const AMOCRM_TOKEN = process.env.AMOCRM_TOKEN;
  if (!AMOCRM_SUBDOMAIN || !AMOCRM_TOKEN || !leadId) return;
  try {
    // Текстовое примечание с данными бронирования
    await fetch(`https://${AMOCRM_SUBDOMAIN}.amocrm.ru/api/v4/leads/${leadId}/notes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AMOCRM_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ note_type: 'common', params: { text } }])
    });
    console.log(`📎 AmoCRM: примечание добавлено к лиду ${leadId}`);
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
      const tgUser = await resolveAuth(initData);
      if (tgUser) {
        const ur = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
        if (ur.rows.length > 0) userId = ur.rows[0].id;
      }
    }
    let result;
    if (userId) {
      result = await pool.query(`
        SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id)::int as spots_taken,
          EXISTS(SELECT 1 FROM event_registrations WHERE event_id = e.id AND user_id = $1) as is_registered
        FROM events e ORDER BY e.date ASC, e.time ASC
      `, [userId]);
    } else {
      result = await pool.query(`
        SELECT e.*, (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id)::int as spots_taken,
          false as is_registered
        FROM events e ORDER BY e.date ASC, e.time ASC
      `);
    }
    res.json(result.rows);
  } catch (e) { console.error('Events list error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Создать событие (админ)
app.post('/api/events', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, date, time, type, spots_total } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'title and date required' });
    await pool.query('INSERT INTO events (title, description, date, time, type, spots_total) VALUES ($1,$2,$3,$4,$5,$6)',
      [title, description || '', date, time || '10:00', type || 'TOUR', spots_total || 30]);
    res.json({ success: true });
  } catch (e) { console.error('Create event error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Редактировать событие (админ)
app.put('/api/events/:id', async (req, res) => {
  try {
    if (!await isAdmin(req.body.initData)) return res.status(403).json({ error: 'Forbidden' });
    const { title, description, date, time, type, spots_total } = req.body;
    await pool.query('UPDATE events SET title=$1, description=$2, date=$3, time=$4, type=$5, spots_total=$6 WHERE id=$7',
      [title, description, date, time, type, spots_total, req.params.id]);
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
    const tgUser = await resolveAuth(req.body.initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT id, first_name FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userRes.rows[0].id;
    const eventRes = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (eventRes.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    const event = eventRes.rows[0];
    const countRes = await pool.query('SELECT COUNT(*) FROM event_registrations WHERE event_id = $1', [req.params.id]);
    if (parseInt(countRes.rows[0].count) >= event.spots_total) return res.status(400).json({ error: 'Мест нет' });
    await pool.query('INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.id, userId]);
    notifyUserTelegram(tgUser.id, `✅ Вы записаны на <b>${event.title}</b>!\n📅 ${event.date} в ${event.time || ''}`);
    res.json({ success: true });
  } catch (e) { console.error('Event register error:', e); res.status(500).json({ error: 'Server error' }); }
});

// Отменить участие в событии
app.post('/api/events/:id/unregister', async (req, res) => {
  try {
    const tgUser = await resolveAuth(req.body.initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await pool.query('DELETE FROM event_registrations WHERE event_id = $1 AND user_id = $2', [req.params.id, userRes.rows[0].id]);
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
        const countRes = await pool.query("SELECT count(*) FROM bookings WHERE user_id = $1 AND stage != 'CANCELLED'", [userId]);
        newProgress = parseInt(countRes.rows[0].count);
      }

      if (['multi_project', 'all_projects'].includes(m.code) && (trigger === 'booking' || trigger === 'init')) {
        const projRes = await pool.query("SELECT count(DISTINCT project_id) FROM bookings WHERE user_id = $1 AND stage != 'CANCELLED'", [userId]);
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
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userRes.rows[0].id;

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
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];
    if (!user.is_registered) return res.status(400).json({ error: 'Сначала зарегистрируйтесь' });

    const result = await withTransaction(async (client) => {
      // Блокируем строку квартиры
      const unitRes = await client.query('SELECT * FROM units WHERE id = $1 FOR UPDATE', [unitId]);
      if (unitRes.rows.length === 0) throw { status: 404, msg: 'Unit not found' };
      const unit = unitRes.rows[0];
      if (unit.status !== 'FREE') throw { status: 400, msg: 'Квартира уже забронирована или продана' };
      // Проверка: нет ли активного бронирования
      const existing = await client.query("SELECT id FROM bookings WHERE unit_id = $1 AND stage != 'CANCELLED'", [unitId]);
      if (existing.rows.length > 0) throw { status: 400, msg: 'На эту квартиру уже есть активное бронирование' };
      const bookingRes = await client.query(
        `INSERT INTO bookings (user_id, unit_id, project_id, user_phone, user_name, user_company, stage)
         VALUES ($1, $2, $3, $4, $5, $6, 'INIT') RETURNING *`,
        [user.id, unitId, unit.project_id || projectId, user.phone, user.first_name, user.company]
      );
      return { success: true, bookingId: bookingRes.rows[0].id };
    });
    // AmoCRM (асинхронно, не блокирует ответ)
    const unitRes2 = await pool.query('SELECT * FROM units WHERE id = $1', [unitId]);
    const unitData = unitRes2.rows[0] || {};
    syncToAmoCRM({ ...result, unit_id: unitId, project_id: unitData.project_id || projectId }, user, unitData).then(async (leadId) => {
      if (leadId) {
        await pool.query('UPDATE bookings SET amocrm_lead_id = $1, amocrm_synced = TRUE WHERE id = $2', [String(leadId), result.bookingId]);
      }
    }).catch(e => console.error('AmoCRM sync error при бронировании:', e));

    // Автопроверка миссий (асинхронно, не блокирует ответ)
    checkMissions(user.id, 'booking').then(rewards => {
      if (rewards.length > 0) console.log(`🎯 Миссии после бронирования user=${user.id}:`, rewards.map(r => r.title).join(', '));
    });
    res.json(result);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.msg });
    console.error('Booking error:', e);
    res.status(500).json({ error: 'Booking error' });
  }
});

// Шаг 1: Загрузка паспорта → квартира BOOKED
app.post('/api/bookings/:id/passport', upload.single('passport'), async (req, res) => {
  try {
    const { initData, buyerName, buyerPhone, consentTransfer } = req.body;
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });

    const bookingRes = await pool.query('SELECT b.*, u.first_name as agent_name, u.phone as agent_phone, u.company as agent_company FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows[0]?.id !== booking.user_id) return res.status(403).json({ error: 'Not your booking' });
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

    // AmoCRM (асинхронно)
    const userFull = await pool.query('SELECT * FROM users WHERE id = $1', [booking.user_id]);
    const passportFile = req.file || null;
    syncToAmoCRM(booking, userFull.rows[0], unit).then(async (leadId) => {
      if (leadId) {
        await pool.query('UPDATE bookings SET amocrm_lead_id = $1, amocrm_synced = TRUE WHERE id = $2', [String(leadId), booking.id]);
        // Добавляем примечание с полными данными бронирования
        const noteText = `📋 Данные бронирования\n\n` +
          `🏠 Квартира: №${unit.number}, этаж ${unit.floor}, ${unit.rooms}-к, ${unit.area} м²\n` +
          `💰 Цена: ${Number(unit.price).toLocaleString('ru-RU')} ₽\n` +
          `📁 Проект: ${booking.project_id}\n\n` +
          `👤 Покупатель: ${buyerName || '—'}\n📞 Телефон покупателя: ${buyerPhone || '—'}\n\n` +
          `🤝 Риелтор: ${booking.agent_name} (${booking.agent_company})\n📞 Телефон риелтора: ${booking.agent_phone}\n\n` +
          `📎 Паспорт: ${passportFile ? passportFile.originalname : 'отправлен на email'}`;
        await attachNoteToAmoCRM(leadId, noteText, passportFile);
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
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });

    const bookingRes = await pool.query('SELECT b.*, u.first_name as agent_name, u.phone as agent_phone, u.company as agent_company FROM bookings b JOIN users u ON b.user_id = u.id WHERE b.id = $1', [req.params.id]);
    if (bookingRes.rows.length === 0) return res.status(404).json({ error: 'Booking not found' });
    const booking = bookingRes.rows[0];

    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows[0]?.id !== booking.user_id) return res.status(403).json({ error: 'Not your booking' });
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
    // Увеличиваем счетчик продаж агента
    await pool.query('UPDATE users SET deals_closed = deals_closed + 1 WHERE id = $1', [booking.user_id]);
    // Обновляем статус квартиры на SOLD
    await pool.query(`UPDATE units SET status = 'SOLD' WHERE id = $1`, [booking.unit_id]);
    res.json({ success: true, emailSent, stage: 'DOCS_SENT' });
  } catch (e) {
    console.error('Documents upload error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Мои бронирования
app.post('/api/bookings/my', async (req, res) => {
  try {
    const { initData } = req.body;
    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });
    const userRes = await pool.query('SELECT id FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const result = await pool.query(`
      SELECT b.*, un.number as unit_number, un.floor as unit_floor, un.area as unit_area,
             un.price as unit_price, un.rooms as unit_rooms, un.status as unit_status, p.name as project_name
      FROM bookings b LEFT JOIN units un ON b.unit_id = un.id LEFT JOIN projects p ON b.project_id = p.id
      WHERE b.user_id = $1 AND b.stage != 'CANCELLED' ORDER BY b.created_at DESC
    `, [userRes.rows[0].id]);
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

    const tgUser = await resolveAuth(initData);
    if (!tgUser) return res.status(401).json({ error: 'Invalid signature' });

    const userRes = await pool.query('SELECT id, is_admin FROM users WHERE telegram_id = $1', [tgUser.id]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRes.rows[0];

    // Только админ может снимать бронь
    if (!user.is_admin) {
      return res.status(403).json({ error: 'Только администратор может снять бронь' });
    }

    await withTransaction(async (client) => {
      await client.query("UPDATE bookings SET stage = 'CANCELLED' WHERE unit_id = $1 AND stage != 'CANCELLED'", [unitId]);
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
  fetchAmoCRMPipelines().then(() => fetchAmoCRMCustomFields());
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}).catch(err => {
  console.error('❌ Fatal: could not init DB, starting anyway...', err);
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} (DB may be unavailable)`));
});
