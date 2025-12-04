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

// Настройки сервера (50mb лимит для больших XML)
app.use(express.json({ limit: '50mb' }));
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

    // 1. Создание таблиц
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        floors INT DEFAULT 1,
        units_per_floor INT DEFAULT 4,
        image_url TEXT
      );
    `);

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

    // 2. Миграции (добавление колонок)
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');

    // 3. АВТО-ЗАПОЛНЕНИЕ ПРОЕКТОВ (НОВОЕ: Чтобы шахматка не была пустой)
    const projCheck = await client.query('SELECT count(*) FROM projects');
    if (parseInt(projCheck.rows[0].count) === 0) {
        console.log('⚡ Inserting Demo Projects...');
        await client.query(`
            INSERT INTO projects (id, name, floors, units_per_floor, image_url) VALUES
            ('brk', 'ЖК Бруклин', 12, 6, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00'),
            ('mnht', 'ЖК Манхэттен', 24, 8, 'https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8'),
            ('bbyk', 'ЖК Бабайка', 9, 4, 'https://images.unsplash.com/photo-1460317442991-0ec209397118'),
            ('chr', 'ЖК Харизма', 16, 5, 'https://images.unsplash.com/photo-1493809842364-78817add7ffb')
        `);
    }
    
    console.log('✅ Database schema ready');
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

// --- API: АВТОРИЗАЦИЯ ---

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

// --- API: ШАХМАТКА И КВАРТИРЫ ---

// 1. Получить проекты
app.get('/api/projects', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM projects');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 2. Получить квартиры
app.get('/api/units/:projectId', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM units WHERE project_id = $1', [req.params.projectId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 3. Генератор Демо-квартир (авто-создание при клике, если пусто)
app.post('/api/generate-demo/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { floors, unitsPerFloor } = req.body;

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

// 4. НАСТОЯЩИЙ ПАРСЕР XML (PROFITBASE)
app.post('/api/sync-xml-url', async (req, res) => {
  const { url, projectId } = req.body;
  
  if (!url || !projectId) return res.status(400).json({ error: 'No URL or ProjectID' });

  try {
    console.log(`📥 Fetching XML from: ${url}`);
    
    // 1. Скачиваем файл
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch XML');
    const xmlText = await response.text();

    console.log(`📦 XML size: ${xmlText.length} bytes`);

    // 2. Парсим
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);

    // Profitbase/Yandex структура: <realty-feed> -> <offer>
    const offers = result?.['realty-feed']?.offer || [];
    console.log(`🏠 Found ${offers.length} offers`);

    let importedCount = 0;

    for (const offer of offers) {
        // Извлекаем данные
        const unitId = offer.$?.['internal-id'] || offer['internal-id']?.[0] || `auto-${Math.random()}`;
        
        const price = parseFloat(offer.price?.[0]?.value?.[0] || '0');
        const floor = parseInt(offer.floor?.[0] || '1');
        
        // Комнаты (очищаем от букв)
        const roomsRaw = offer.rooms?.[0] || '1';
        const rooms = parseInt(roomsRaw.toString().replace(/\D/g, '') || '1'); 
        
        const area = parseFloat(offer.area?.[0]?.value?.[0] || '0');
        
        // Номер квартиры (иногда flat-number, иногда apartment)
        const number = offer['flat-number']?.[0] || offer.apartment?.[0] || '0';
        
        // План
        const planUrl = offer.plan?.[0] || offer.image?.[0] || '';

        // Статус
        let statusRaw = 'available'; 
        if (offer['deal-status']) statusRaw = offer['deal-status'][0];
        
        let status = 'FREE';
        if (statusRaw === 'booked' || statusRaw === 'reserved') status = 'BOOKED';
        if (statusRaw === 'sold') status = 'SOLD';

        // 3. Записываем в базу
        await client.query(`
            INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE 
            SET price = EXCLUDED.price, status = EXCLUDED.status, plan_image_url = EXCLUDED.plan_image_url;
        `, [unitId, projectId, floor, number, rooms, area, price, status, planUrl]);
        
        importedCount++;
    }

    res.json({ success: true, count: importedCount });

  } catch (e) {
    console.error('XML Sync Error:', e);
    res.status(500).json({ error: 'Sync failed: ' + e.message });
  }
});

// Чит-код
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
