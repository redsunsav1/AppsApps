import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js'; // Библиотека для XML

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

// Настройки сервера
app.use(express.json({ limit: '50mb' })); // Увеличили лимит для больших XML
app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

// Подключение к БД
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Database');

    // 1. Пользователи
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

    // 2. Новости
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

    // 3. Проекты (ЖК) - НОВОЕ
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        floors INT DEFAULT 1,
        units_per_floor INT DEFAULT 4,
        image_url TEXT
      );
    `);

    // 4. Квартиры (Units) - НОВОЕ
    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,
        project_id TEXT,
        floor INT,
        number TEXT,
        rooms INT,
        area NUMERIC,
        price NUMERIC,
        status TEXT,
        plan_image_url TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Миграции (на случай старой базы)
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    
    console.log('✅ DB Schema synced');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
};

initDb();

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
async function isAdmin(initData) {
  if (!initData) return false;
  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));
    const res = await client.query('SELECT is_admin FROM users WHERE telegram_id = $1', [user.id]);
    return res.rows.length > 0 && res.rows[0].is_admin;
  } catch (e) {
    return false;
  }
}

// --- API: АВТОРИЗАЦИЯ И ПОЛЬЗОВАТЕЛИ ---

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
    console.error('Auth Error:', e);
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

// --- API: НОВОСТИ ---

app.get('/api/news', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM news ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.post('/api/news', async (req, res) => {
  const { initData, title, text, image_url, project_name, progress, checklist } = req.body;
  if (await isAdmin(initData)) {
    await client.query(
      'INSERT INTO news (title, text, image_url, project_name, progress, checklist) VALUES ($1, $2, $3, $4, $5, $6)',
      [title, text, image_url, project_name || 'Новости', progress || 0, JSON.stringify(checklist || [])]
    );
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

app.delete('/api/news/:id', async (req, res) => {
  const { initData } = req.body; 
  if (await isAdmin(initData)) {
    await client.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

app.put('/api/news/:id', async (req, res) => {
  const { initData, title, text, image_url, project_name, progress, checklist } = req.body;
  if (await isAdmin(initData)) {
    await client.query(
      `UPDATE news SET title=$1, text=$2, image_url=$3, project_name=$4, progress=$5, checklist=$6 WHERE id=$7`,
      [title, text, image_url, project_name, progress, JSON.stringify(checklist), req.params.id]
    );
    res.json({ success: true });
  } else {
    res.status(403).json({ error: 'Forbidden' });
  }
});

// --- API: ШАХМАТКА И КВАРТИРЫ (НОВОЕ) ---

// 1. Список проектов
app.get('/api/projects', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM projects');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 2. Квартиры проекта
app.get('/api/units/:projectId', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM units WHERE project_id = $1', [req.params.projectId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 3. Генератор Демо-данных (Для теста)
app.post('/api/generate-demo/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { floors, unitsPerFloor } = req.body;

    // Создаем проект
    await client.query(`
        INSERT INTO projects (id, name, floors, units_per_floor)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
    `, [projectId, 'Demo ЖК', floors, unitsPerFloor]);

    // Генерируем квартиры
    for(let f = 1; f <= floors; f++) {
        for(let u = 1; u <= unitsPerFloor; u++) {
            const statusRandom = Math.random();
            let status = 'FREE';
            if (statusRandom > 0.7) status = 'SOLD';
            else if (statusRandom > 0.5) status = 'BOOKED';

            await client.query(`
                INSERT INTO units (id, project_id, floor, number, rooms, area, price, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
            `, [
                `${projectId}-${f}-${u}`, projectId, f, `${f}0${u}`, 
                Math.floor(Math.random() * 3) + 1, 
                Math.floor(Math.random() * 40) + 30, 
                Math.floor(Math.random() * 5000000) + 5000000, 
                status
            ]);
        }
    }
    res.json({ success: true });
});

// 4. Парсер XML (Заготовка)
app.post('/api/sync-xml', async (req, res) => {
  const { xmlContent, projectId } = req.body;
  if (!xmlContent) return res.status(400).json({ error: 'No XML' });

  try {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);
    // Тут будет логика парсинга, пока просто возвращаем успех
    res.json({ success: true, message: 'XML parsed (logic pending)' });
  } catch (e) {
    res.status(500).json({ error: 'XML Error' });
  }
});

// --- Чит-код Админа ---
app.get('/api/make-admin', async (req, res) => {
  const { id, secret } = req.query;
  if (secret !== '12345') return res.send('Wrong secret');
  await client.query('UPDATE users SET is_admin = TRUE WHERE telegram_id = $1', [id]);
  res.send(`User ${id} is now admin!`);
});

// Фронтенд
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
