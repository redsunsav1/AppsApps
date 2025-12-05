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

// --- СИНХРОНИЗАЦИЯ "ПО ПОРЯДКУ" (БЕЗ НОМЕРОВ) ---
async function syncProjectWithXml(projectId, url) {
    console.log(`🔄 Syncing ${projectId}...`);
    
    // 1. Настройки дома (ЖК Бабайка: 19 эт, 8 кв, старт со 2 эт)
    const floorsTotal = 19;
    const unitsPerFloor = 8;
    const startFloor = 2;
    
    // Сначала очищаем старые данные и создаем СКЕЛЕТ
    await client.query('DELETE FROM units WHERE project_id = $1', [projectId]);

    console.log('💀 Generating skeleton (SOLD)...');
    let globalFlatNumber = 1; 
    
    // Создаем все квартиры как "ПРОДАНО"
    // Важно: создаем их в строгом порядке (этаж 2 кв 1..8, этаж 3 кв 1..8)
    for (let f = startFloor; f <= floorsTotal; f++) {
        for (let u = 1; u <= unitsPerFloor; u++) {
            await client.query(`
                INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url)
                VALUES ($1, $2, $3, $4, $5, $6, $7, 'SOLD', '')
            `, [`${projectId}-${f}-${u}`, projectId, f, String(globalFlatNumber), 0, 0, 0]);
            globalFlatNumber++;
        }
    }

    // 2. СКАЧИВАЕМ И ПАРСИМ XML
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch XML');
    const xmlText = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);
    const offers = result?.['realty-feed']?.offer || [];
    
    console.log(`📦 XML Loaded: ${offers.length} offers.`);

    // 3. СОРТИРУЕМ ОФФЕРЫ ИЗ XML
    // Profitbase обычно отдает их вразнобой. Нам нужно отсортировать их так же, как мы создавали скелет.
    // Сортируем по этажу (с 2 по 19), а внутри этажа - по площади (от меньшей к большей)
    // Это единственный способ угадать порядок без номеров квартир.
    
    const sortedOffers = offers.map(o => ({
        data: o,
        floor: parseInt(o.floor?.[0] || '0'),
        area: parseFloat(o.area?.[0]?.value?.[0] || '0')
    })).sort((a, b) => {
        if (a.floor === b.floor) return a.area - b.area; // Слева направо по площади
        return a.floor - b.floor; // Снизу вверх по этажам
    });

    // 4. НАКЛАДЫВАЕМ ДАННЫЕ
    // Берем все созданные квартиры из базы (отсортированные так же: floor ASC, number ASC)
    const dbUnitsRes = await client.query('SELECT * FROM units WHERE project_id = $1 ORDER BY floor ASC, CAST(number AS INT) ASC', [projectId]);
    const dbUnits = dbUnitsRes.rows;

    let updatedCount = 0;
    
    // Идем по списку квартир из XML и кладем их в первые попавшиеся слоты на нужном этаже
    for (const item of sortedOffers) {
        const offer = item.data;
        const floor = item.floor;
        
        // Ищем в базе первую СВОБОДНУЮ (точнее SOLD) ячейку на ЭТОМ этаже
        const targetUnit = dbUnits.find(u => u.floor === floor && u.status === 'SOLD'); // SOLD тут значит "еще не обновлена"
        
        if (targetUnit) {
            // Нашли слот! Обновляем его.
            const price = parseFloat(offer.price?.[0]?.value?.[0] || '0');
            const rooms = parseInt((offer.rooms?.[0] || '1').toString().replace(/\D/g, ''));
            const area = item.area;
            const planUrl = offer['planning-image']?.[0] || offer.image?.[0] || '';

            // Статус
            let status = 'FREE';
            let rawStatus = '';
            if (offer['deal-status']) rawStatus += JSON.stringify(offer['deal-status']);
            const s = rawStatus.toLowerCase();
            if (s.includes('book') || s.includes('reserv') || s.includes('бронь')) status = 'BOOKED';
            
            // Обновляем в базе по ID найденного слота
            await client.query(`
                UPDATE units 
                SET price = $1, status = $2, rooms = $3, area = $4, plan_image_url = $5
                WHERE id = $6
            `, [price, status, rooms, area, planUrl, targetUnit.id]);
            
            // Помечаем в локальном массиве, что этот слот занят (чтобы не перезаписать)
            targetUnit.status = 'UPDATED'; 
            updatedCount++;
        }
    }

    // Обновляем настройки проекта
    await client.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3 WHERE id = $4', [floorsTotal, unitsPerFloor, url, projectId]);
    
    console.log(`🏁 Done. Updated: ${updatedCount}. Total slots: ${dbUnits.length}`);
    return { count: updatedCount, total: dbUnits.length };
}

cron.schedule('0 10 * * *', async () => {
    try {
        const res = await client.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
        for (const project of res.rows) {
            await syncProjectWithXml(project.id, project.feed_url);
        }
    } catch (e) { console.error('Cron Error:', e); }
});

// API
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
    const result = await syncProjectWithXml(projectId, url);
    res.json({ success: true, count: result.count });
  } catch (e) {
    console.error(e);
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
