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

app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'dist')));

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const initDb = async () => {
  try {
    await client.connect();
    console.log('✅ Connected to Database');

    // Таблицы
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username TEXT, first_name TEXT, balance INT DEFAULT 0, phone TEXT, company TEXT, is_registered BOOLEAN DEFAULT FALSE, is_admin BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, image_url TEXT, project_name TEXT, progress INT DEFAULT 0, checklist JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, floors INT DEFAULT 1, units_per_floor INT DEFAULT 4, image_url TEXT, feed_url TEXT);`);
    await client.query(`CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, project_id TEXT, floor INT, number TEXT, rooms INT, area NUMERIC, price NUMERIC, status TEXT, plan_image_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // Миграции
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS project_name TEXT;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0;');
    await client.query('ALTER TABLE news ADD COLUMN IF NOT EXISTS checklist JSONB;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;');
    await client.query('ALTER TABLE projects ADD COLUMN IF NOT EXISTS feed_url TEXT;');

    const projCheck = await client.query('SELECT count(*) FROM projects');
    if (parseInt(projCheck.rows[0].count) === 0) {
        await client.query(`INSERT INTO projects (id, name, floors, units_per_floor, image_url) VALUES ('brk', 'ЖК Бруклин', 12, 6, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00') ON CONFLICT DO NOTHING`);
    }
  } catch (err) { console.error('❌ DB Error:', err); }
};
initDb();

// --- УМНАЯ СИНХРОНИЗАЦИЯ (С ГЕНЕРАЦИЕЙ НОМЕРОВ) ---
async function syncProjectWithXml(projectId, url) {
    console.log(`🔄 START SYNC: ${projectId}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch XML');
    const xmlText = await response.text();

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);
    const rawOffers = result?.['realty-feed']?.offer || [];
    
    console.log(`📦 Raw offers: ${rawOffers.length}. Processing...`);
    await client.query('DELETE FROM units WHERE project_id = $1', [projectId]);

    // 1. ПРЕДОБРАБОТКА: Фильтруем и Сортируем
    // Нам нужно выстроить их в цепочку: 2 этаж (кв 1-8), 3 этаж (кв 9-16)...
    const cleanOffers = [];

    for (const offer of rawOffers) {
        const floor = parseInt(offer.floor?.[0] || '1');
        // Игнорируем 1 этаж (кладовки)
        if (floor < 2) continue;
        
        // Достаем площадь для вторичной сортировки (обычно на этаже квартиры идут по возрастанию площади или комнат)
        const area = parseFloat(offer.area?.[0]?.value?.[0] || '0');
        
        cleanOffers.push({
            data: offer,
            floor: floor,
            area: area
        });
    }

    // Сортируем: Сначала по Этажу (2->19), потом по Площади (меньше->больше) - это попытка угадать порядок "слева направо"
    cleanOffers.sort((a, b) => {
        if (a.floor === b.floor) {
            return a.area - b.area; 
        }
        return a.floor - b.floor;
    });

    // 2. ЗАПИСЬ В БАЗУ С НОВЫМИ НОМЕРАМИ
    let globalCounter = 1; // Начинаем нумерацию с 1
    let maxFloor = 1;

    for (const item of cleanOffers) {
        const offer = item.data;
        const floor = item.floor;
        
        if (floor > maxFloor) maxFloor = floor;

        const unitId = offer.$?.['internal-id'] || `auto-${Math.random()}`;
        const price = parseFloat(offer.price?.[0]?.value?.[0] || '0');
        const roomsRaw = (offer.rooms?.[0] || offer['room-count']?.[0] || '1').toString();
        const rooms = parseInt(roomsRaw.replace(/\D/g, '') || '1'); 
        const area = item.area;
        
        // !!! ГЕНЕРИРУЕМ НОМЕР !!!
        const number = globalCounter.toString();
        
        const planUrl = offer['planning-image']?.[0] || offer.image?.[0] || '';

        // --- СТАТУСЫ ---
        let rawInfo = '';
        if (offer['deal-status']) rawInfo += JSON.stringify(offer['deal-status']);
        if (offer['sales-status']) rawInfo += JSON.stringify(offer['sales-status']);
        if (offer.description) rawInfo += JSON.stringify(offer.description);

        const s = rawInfo.toLowerCase();
        let status = 'FREE';

        if (s.includes('sold') || s.includes('продано') || s.includes('busy') || s.includes('rent') || price < 100) {
            status = 'SOLD';
        } else if (s.includes('book') || s.includes('reserv') || s.includes('бронь') || s.includes('забронирован')) {
            status = 'BOOKED';
        } else {
            status = 'FREE';
        }

        await client.query(`
            INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [unitId, projectId, floor, number, rooms, area, price, status, planUrl]);
        
        globalCounter++;
    }
    
    // Обновляем проект: Ставим 8 квартир на этаж (как ты сказал)
    const unitsPerFloor = 8; 
    
    console.log(`✅ Synced ${globalCounter - 1} units. Floors: 2-${maxFloor}.`);

    await client.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3 WHERE id = $4', [maxFloor, unitsPerFloor, url, projectId]);
    
    return globalCounter - 1;
}

cron.schedule('0 10 * * *', async () => {
    try {
        const res = await client.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
        for (const project of res.rows) {
            if (project.feed_url) await syncProjectWithXml(project.id, project.feed_url);
        }
    } catch (e) { console.error('Cron Error:', e); }
});

// API (стандарт)
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
app.post('/api/generate-demo/:projectId', async (req, res) => { res.json({ success: true }); });

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
