// ... (Весь верхний код инициализации базы оставляем как был) ...
// Я привожу полный код файла, чтобы ты просто заменил всё и не запутался.

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    await client.connect();
    // Таблицы (код тот же)
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS news (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        image_url TEXT,
        project_name TEXT, 
        progress INT DEFAULT 0,
        checklist JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Миграции (код тот же)
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS company TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT FALSE;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    
    console.log('✅ Database connected & checked');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
};

initDb();

// --- API ---

// Auth & Register (Код тот же)
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
    res.status(500).json({ error: 'Error' });
  }
});

// --- НОВОСТИ (CRUD) ---

// 1. Получить
app.get('/api/news', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 2. Добавить (POST)
app.post('/api/news', async (req, res) => {
  const { initData, title, text, image_url, project_name, progress, checklist } = req.body;
  try {
    if (await isAdmin(initData)) {
      await client.query(
        'INSERT INTO news (title, text, image_url, project_name, progress, checklist) VALUES ($1, $2, $3, $4, $5, $6)',
        [title, text, image_url, project_name || 'Новости', progress || 0, JSON.stringify(checklist || [])]
      );
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

// 3. УДАЛИТЬ (DELETE) - НОВОЕ!
app.delete('/api/news/:id', async (req, res) => {
  const { initData } = req.body; // Передаем initData в body для проверки админа
  const { id } = req.params;
  try {
    if (await isAdmin(initData)) {
      await client.query('DELETE FROM news WHERE id = $1', [id]);
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

// 4. ОБНОВИТЬ (PUT) - НОВОЕ!
app.put('/api/news/:id', async (req, res) => {
  const { initData, title, text, image_url, project_name, progress, checklist } = req.body;
  const { id } = req.params;
  try {
    if (await isAdmin(initData)) {
      await client.query(
        `UPDATE news SET 
         title = $1, text = $2, image_url = $3, project_name = $4, progress = $5, checklist = $6 
         WHERE id = $7`,
        [title, text, image_url, project_name, progress, JSON.stringify(checklist), id]
      );
      res.json({ success: true });
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error' });
  }
});

// Вспомогательная функция проверки админа
async function isAdmin(initData) {
  if (!initData) return false;
  const urlParams = new URLSearchParams(initData);
  const telegramUser = JSON.parse(urlParams.get('user'));
  const userCheck = await client.query('SELECT is_admin FROM users WHERE telegram_id = $1', [telegramUser.id]);
  return userCheck.rows.length > 0 && userCheck.rows[0].is_admin;
}

// Make Admin Link
app.get('/api/make-admin', async (req, res) => {
  const { id, secret } = req.query;
  if (secret !== '12345') return res.send('Wrong secret');
  await client.query('UPDATE users SET is_admin = TRUE WHERE telegram_id = $1', [id]);
  res.send(`User ${id} is now admin!`);
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
