import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto'; // Нужно для проверки подписи админа
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ ---
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Database');

    // 1. Таблица пользователей (Твоя + колонка админа)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username TEXT,
        first_name TEXT,
        balance INT DEFAULT 0,
        phone TEXT,
        company TEXT,
        is_registered BOOLEAN DEFAULT FALSE,
        is_admin BOOLEAN DEFAULT FALSE, 
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Таблица новостей (Новая)
    await client.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Обновляем структуру, если колонки отсутствовали
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT FALSE;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    
    console.log('✅ Database schema updated');
  } catch (err) {
    console.error('❌ DB Connection Error:', err);
  }
};

initDb();

// --- ВХОД ---
app.post('/api/auth', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No data' });

  try {
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

// --- РЕГИСТРАЦИЯ (Твой код) ---
app.post('/api/register', async (req, res) => {
  const { initData, phone, company, name } = req.body;

  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));

    const result = await client.query(
      'UPDATE users SET phone = $1, company = $2, first_name = $3, is_registered = TRUE WHERE telegram_id = $4 RETURNING *',
      [phone, company, name, user.id]
    );

    res.json({ user: result.rows[0], success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration error' });
  }
});

// --- НОВОСТИ (Новое) ---

// Получить список
app.get('/api/news', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// Добавить новость (Только если is_admin = TRUE)
app.post('/api/news', async (req, res) => {
  const { initData, title, text, image_url } = req.body;
  
  try {
    const urlParams = new URLSearchParams(initData);
    const telegramUser = JSON.parse(urlParams.get('user'));

    // Проверяем в базе: правда ли он админ?
    const userCheck = await client.query('SELECT is_admin FROM users WHERE telegram_id = $1', [telegramUser.id]);
    
    if (userCheck.rows.length > 0 && userCheck.rows[0].is_admin) {
      await client.query(
        'INSERT INTO news (title, text, image_url) VALUES ($1, $2, $3)',
        [title, text, image_url]
      );
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Доступ запрещен' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error adding news' });
  }
});

// Секретная ссылка, чтобы сделать себя админом (запусти один раз в браузере)
// https://твое-приложение.amvera.io/api/make-admin?id=ТВОЙ_ID&secret=12345
app.get('/api/make-admin', async (req, res) => {
  const { id, secret } = req.query;
  if (secret !== '12345') return res.send('Wrong secret'); // Пароль 12345
  
  await client.query('UPDATE users SET is_admin = TRUE WHERE telegram_id = $1', [id]);
  res.send(`User ${id} is now admin! Please restart the app.`);
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
