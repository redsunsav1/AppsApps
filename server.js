import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

// Настройки сервера
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

    // 1. Таблицы
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username TEXT, first_name TEXT, balance INT DEFAULT 0, phone TEXT, company TEXT, is_registered BOOLEAN DEFAULT FALSE, is_admin BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, image_url TEXT, project_name TEXT, progress INT DEFAULT 0, checklist JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    
    // Проекты + feed_url
    await client.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, floors INT DEFAULT 1, units_per_floor INT DEFAULT 4, image_url TEXT, feed_url TEXT);`);
    
    // Квартиры
    await client.query(`CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, project_id TEXT, floor INT, number TEXT, rooms INT, area NUMERIC, price NUMERIC, status TEXT, plan_image_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // Миграции
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS feed_url TEXT;'); // Храним ссылку на фид

    // Авто-создание демо-проектов, если база пустая
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
    console.log('✅ Database ready');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
};

initDb();

// --- УМНАЯ СИНХРОНИЗАЦИЯ ---
async function syncProjectWithXml(projectId, url) {
    console.log(`🔄 Syncing project ${projectId} from ${url}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch XML');
    const xmlText = await response.text();

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);
    const offers = result?.['realty-feed']?.offer || [];
    
    console.log(`📦 Offers found: ${offers.length}`);

    let count = 0;
    let maxFloor = 1;
    let maxUnitsOnFloor = 0;
    const floorCounts = {}; // Считаем квартиры на каждом этаже

    for (const offer of offers) {
        const unitId = offer.$?.['internal-id'] || offer['internal-id']?.[0] || `auto-${Math.random()}`;
        const price = parseFloat(offer.price?.[0]?.value?.[0] || '0');
        const floor = parseInt(offer.floor?.[0] || '1');
        
        // Обновляем макс этаж
        if (floor > maxFloor) maxFloor = floor;

        // Считаем макс квартир на этаже (для ширины сетки)
        if (!floorCounts[floor]) floorCounts[floor] = 0;
        floorCounts[floor]++;
        if (floorCounts[floor] > maxUnitsOnFloor) maxUnitsOnFloor = floorCounts[floor];

        const roomsRaw = (offer.rooms?.[0] || offer['room-count']?.[0] || '1').toString();
        const rooms = parseInt(roomsRaw.replace(/\D/g, '') || '1'); 
        const area = parseFloat(offer.area?.[0]?.value?.[0] || '0');
        const number = offer['flat-number']?.[0] || offer.apartment?.[0] || '0';
        const planUrl = offer['planning-image']?.[0] || offer.image?.[0] || '';

        // --- ЛОГИКА СТАТУСОВ (ПРОКАЧАННАЯ) ---
        let statusRaw = ''; 
        if (offer['deal-status']) statusRaw += offer['deal-status'][0];
        if (offer['sales-status']) statusRaw += ' ' + offer['sales-status'][0];
        
        // Добавляем проверку категории (иногда там пишут "Продажа" или "Сдано")
        if (offer.category) statusRaw += ' ' + offer.category[0];

        const s = statusRaw.toLowerCase();
        let status = 'FREE';

        // 1. Явные признаки продажи/брони
        if (s.includes('sold') || s.includes('продано') || s.includes('сдано') || s.includes('busy')) {
            status = 'SOLD';
        } else if (s.includes('book') || s.includes('reserv') || s.includes('бронь')) {
            status = 'BOOKED';
        } else if (price < 1000) {
            // Если цены нет или она 0 — скорее всего продано
            status = 'SOLD'; 
        } else {
            status = 'FREE';
        }

        await client.query(`
            INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE 
            SET price = EXCLUDED.price, status = EXCLUDED.status, floor = EXCLUDED.floor, plan_image_url = EXCLUDED.plan_image_url, number = EXCLUDED.number;
        `, [unitId, projectId, floor, number, rooms, area, price, status, planUrl]);
        count++;
    }
    
    // Обновляем этажность и ШИРИНУ проекта (ставим 8 или сколько насчитали)
    const unitsWidth = maxUnitsOnFloor > 0 ? maxUnitsOnFloor : 8;
    
    if (maxFloor > 1) {
        await client.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3 WHERE id = $4', [maxFloor, unitsWidth, url, projectId]);
    } else {
        await client.query('UPDATE projects SET feed_url = $1 WHERE id = $2', [url, projectId]);
    }
    
    return count;
}

// CRON (Автоматическое обновление каждый день)
cron.schedule('0 10 * * *', async () => {
    try {
        const res = await client.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
        for (const project of res.rows) {
            if (project.feed_url) await syncProjectWithXml(project.id, project.feed_url);
        }
    } catch (e) { console.error('Cron Error:', e); }
});

// --- API ---

async function isAdmin(initData) {
  if (!initData) return false;
  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));
    const res = await client.query('SELECT is_admin FROM users WHERE telegram_id = $1', [user.id]);
    return res.rows.length > 0 && res.rows[0].is_admin;
  } catch (e) { return false; }
}

app.post('/api/auth', async (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.status(400).json({ error: 'No data' });
  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));
    let dbUser = await client.query('SELECT * FROM users WHERE telegram_id = $1', [user.id]);
    if (dbUser.rows.length === 0) {
      dbUser = await client.query('INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3) RETURNING *', [user.id, user.username, user.first_name]);
    }
    res.json({ user: dbUser.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Auth error' }); }
});

app.post('/api/register', async (req, res) => {
  const { initData, phone, company, name } = req.body;
  try {
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));
    await client.query('UPDATE users SET phone = $1, company = $2, first_name = $3, is_registered = TRUE WHERE telegram_id = $4', [phone, company, name, user.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Error' }); }
});

app.get('/api/news', async (req, res) => {
  const result = await client.query('SELECT * FROM news ORDER BY created_at DESC');
  res.json(result.rows);
});

app.post('/api/news', async (req, res) => {
  if (await isAdmin(req.body.initData)) {
    const { title, text, image_url, project_name, progress, checklist } = req.body;
    await client.query('INSERT INTO news (title, text, image_url, project_name, progress, checklist) VALUES ($1, $2, $3, $4, $5, $6)', [title, text, image_url, project_name, progress, JSON.stringify(checklist)]);
    res.json({ success: true });
  } else res.status(403).json({ error: 'Forbidden' });
});

app.delete('/api/news/:id', async (req, res) => {
  if (await isAdmin(req.body.initData)) {
    await client.query('DELETE FROM news WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } else res.status(403).json({ error: 'Forbidden' });
});

app.put('/api/news/:id', async (req, res) => {
  if (await isAdmin(req.body.initData)) {
    const { title, text, image_url, project_name, progress, checklist } = req.body;
    await client.query(`UPDATE news SET title=$1, text=$2, image_url=$3, project_name=$4, progress=$5, checklist=$6 WHERE id=$7`, [title, text, image_url, project_name, progress, JSON.stringify(checklist), req.params.id]);
    res.json({ success: true });
  } else res.status(403).json({ error: 'Forbidden' });
});

app.get('/api/projects', async (req, res) => {
  const result = await client.query('SELECT * FROM projects');
  res.json(result.rows);
});

app.get('/api/units/:projectId', async (req, res) => {
  const result = await client.query('SELECT * FROM units WHERE project_id = $1', [req.params.projectId]);
  res.json(result.rows);
});

app.post('/api/generate-demo/:projectId', async (req, res) => {
    res.json({ success: true });
});

app.post('/api/sync-xml-url', async (req, res) => {
  const { url, projectId } = req.body;
  if (!url || !projectId) return res.status(400).json({ error: 'No URL or ProjectID' });
  try {
    const count = await syncProjectWithXml(projectId, url);
    res.json({ success: true, count });
  } catch (e) {
    res.status(500).json({ error: 'Sync failed: ' + e.message });
  }
});

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
