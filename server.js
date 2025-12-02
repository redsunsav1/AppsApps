import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Настройка путей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// Подключение к БД
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Инициализация Таблиц
const initDb = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Database');

    // Создаем таблицу
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        balance INT DEFAULT 0,
        phone TEXT,
        company TEXT,
        city TEXT,
        is_registered BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Добавляем колонки, если их нет (Миграция)
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT FALSE;');
    
    console.log('✅ Database schema updated');
  } catch (err) {
    console.error('❌ DB Connection/Setup Error:', err);
  }
};

initDb();

// Проверка подписи Telegram
const verifyTelegramWebAppData = (telegramInitData) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return true; // Если токен не задан (локальный тест), пропускаем
  
  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  
  const params = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
    
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(params).digest('hex');
  
  return calculatedHash === hash;
};

// --- API: ВХОД ---
app.post('/api/auth', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No data' });

  try {
    // В продакшене раскомментировать проверку!
    // const isValid = verifyTelegramWebAppData(initData);
    // if (!isValid) return res.status(403).json({ error: 'Invalid signature' });

    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));

    const findResult = await client.query('SELECT * FROM users WHERE telegram_id = $1', [user.id]);

    if (findResult.rows.length > 0) {
      return res.json({ user: findResult.rows[0], status: 'exists' });
    } else {
      const insertResult = await client.query(
        'INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING *',
        [user.id, user.username, user.first_name]
      );
      return res.json({ user: insertResult.rows[0], status: 'created' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- API: РЕГИСТРАЦИЯ ---
app.post('/api/register', async (req, res) => {
  const { initData, phone, company } = req.body;

  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));

    const result = await client.query(
      'UPDATE users SET phone = $1, company = $2, is_registered = TRUE WHERE telegram_id = $3 RETURNING *',
      [phone, company, user.id]
    );

    res.json({ user: result.rows[0], success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration error' });
  }
});

// --- ОТДАЧА ФРОНТЕНДА ---
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
