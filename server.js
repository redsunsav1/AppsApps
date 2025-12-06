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

    // Таблицы (существующие)
    await client.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username TEXT, first_name TEXT, balance INT DEFAULT 0, gold_balance INT DEFAULT 0, phone TEXT, company TEXT, is_registered BOOLEAN DEFAULT FALSE, is_admin BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS news (id SERIAL PRIMARY KEY, title TEXT NOT NULL, text TEXT NOT NULL, image_url TEXT, project_name TEXT, progress INT DEFAULT 0, checklist JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await client.query(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, floors INT DEFAULT 1, units_per_floor INT DEFAULT 4, image_url TEXT, feed_url TEXT);`);
    await client.query(`CREATE TABLE IF NOT EXISTS units (id TEXT PRIMARY KEY, project_id TEXT, floor INT, number TEXT, rooms INT, area NUMERIC, price NUMERIC, status TEXT, plan_image_url TEXT, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // --- НОВЫЕ ТАБЛИЦЫ ДЛЯ МАГАЗИНА ---
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        price INT NOT NULL,
        currency TEXT DEFAULT 'SILVER', -- 'SILVER' or 'GOLD'
        image_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INT, -- ссылка на users.id
        product_id INT,
        price INT,
        currency TEXT,
        status TEXT DEFAULT 'NEW', -- NEW, DONE
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Миграции
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gold_balance INT DEFAULT 0;'); // Золотые монеты

    // Остальные миграции...
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

// ... (ТВОЙ КОД ПАРСЕРА ОСТАВЛЯЕМ КАК БЫЛ) ...
// Я скрыл его для краткости, но он должен быть здесь!
// syncProjectWithXml, cron, и т.д.
// Вставь сюда функцию syncProjectWithXml из предыдущего server.js

async function syncProjectWithXml(projectId, url) {
    // ... (КОПИРУЙ ИЗ ПРОШЛОГО ВАРИАНТА) ...
    // Чтобы не потерять парсер
    console.log(`🔄 Syncing ${projectId}...`);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch XML');
    const xmlText = await response.text();
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlText);
    const offers = result?.['realty-feed']?.offer || [];
    await client.query('DELETE FROM units WHERE project_id = $1', [projectId]);
    let count = 0; let maxFloor = 1; const floorCounts = {};
    for (const offer of offers) {
        const floor = parseInt(offer.floor?.[0] || '1');
        if (floor < 1) continue; 
        const unitId = offer.$?.['internal-id'] || `auto-${Math.random()}`;
        const price = parseFloat(offer.price?.[0]?.value?.[0] || '0');
        if (floor > maxFloor) maxFloor = floor;
        if (!floorCounts[floor]) floorCounts[floor] = 0; floorCounts[floor]++;
        const roomsRaw = (offer.rooms?.[0] || offer['room-count']?.[0] || '1').toString();
        const rooms = parseInt(roomsRaw.replace(/\D/g, '') || '1'); 
        const area = parseFloat(offer.area?.[0]?.value?.[0] || '0');
        const number = offer['flat-number']?.[0] || offer.apartment?.[0] || '0';
        const planUrl = offer['planning-image']?.[0] || offer.image?.[0] || '';
        let statusRaw = ''; 
        if (offer['deal-status']) statusRaw += JSON.stringify(offer['deal-status']);
        if (offer['sales-status']) rawStatus += JSON.stringify(offer['sales-status']);
        if (offer.description) statusRaw += JSON.stringify(offer.description);
        const s = statusRaw.toLowerCase();
        let status = 'FREE';
        if (s.includes('sold') || s.includes('продано') || s.includes('busy') || price < 100) status = 'SOLD';
        else if (s.includes('book') || s.includes('reserv') || s.includes('бронь')) status = 'BOOKED';
        else status = 'FREE';
        await client.query(`INSERT INTO units (id, project_id, floor, number, rooms, area, price, status, plan_image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [unitId, projectId, floor, number, rooms, area, price, status, planUrl]);
        count++;
    }
    const maxUnitsOnFloor = Math.max(...Object.values(floorCounts), 4);
    await client.query('UPDATE projects SET floors = $1, units_per_floor = $2, feed_url = $3 WHERE id = $4', [maxFloor, maxUnitsOnFloor, url, projectId]);
    return count;
}

cron.schedule('0 10 * * *', async () => {
    try {
        const res = await client.query('SELECT id, feed_url FROM projects WHERE feed_url IS NOT NULL');
        for (const project of res.rows) {
            if (project.feed_url) await syncProjectWithXml(project.id, project.feed_url);
        }
    } catch (e) { console.error('Cron Error:', e); }
});

// --- API: ПОЛЬЗОВАТЕЛИ ---

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
      // При регистрации даем 0 золота
      dbUser = await client.query('INSERT INTO users (telegram_id, username, first_name, gold_balance) VALUES ($1, $2, $3, 0) RETURNING *', [user.id, user.username, user.first_name]);
    }
    res.json({ user: dbUser.rows[0] });
  } catch (e) { res.status(500).json({ error: 'Auth error' }); }
});

// --- API: МАГАЗИН (НОВОЕ) ---

// 1. Получить товары
app.get('/api/products', async (req, res) => {
  try {
    // Показываем только активные товары, сначала Золотые
    const result = await client.query("SELECT * FROM products WHERE is_active = TRUE ORDER BY currency DESC, price ASC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: 'DB Error' }); }
});

// 2. Добавить товар (Админ)
app.post('/api/products', async (req, res) => {
  if (await isAdmin(req.body.initData)) {
    const { title, price, currency, image_url } = req.body;
    await client.query(
      'INSERT INTO products (title, price, currency, image_url) VALUES ($1, $2, $3, $4)',
      [title, price, currency || 'SILVER', image_url]
    );
    res.json({ success: true });
  } else res.status(403).json({ error: 'Forbidden' });
});

// 3. Удалить/Скрыть товар (Админ)
app.delete('/api/products/:id', async (req, res) => {
  if (await isAdmin(req.body.initData)) {
    // Мы не удаляем, а делаем is_active = false, чтобы сохранить историю покупок
    await client.query('UPDATE products SET is_active = FALSE WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } else res.status(403).json({ error: 'Forbidden' });
});

// 4. ПОКУПКА
app.post('/api/buy', async (req, res) => {
  const { initData, productId } = req.body;
  try {
    const urlParams = new URLSearchParams(initData);
    const userTg = JSON.parse(urlParams.get('user'));

    // 1. Ищем юзера и товар
    const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1', [userTg.id]);
    const prodRes = await client.query('SELECT * FROM products WHERE id = $1', [productId]);

    if (userRes.rows.length === 0 || prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'User or Product not found' });
    }

    const user = userRes.rows[0];
    const product = prodRes.rows[0];

    // 2. Проверяем баланс
    if (product.currency === 'GOLD') {
       if (user.gold_balance < product.price) return res.status(400).json({ error: 'Не хватает золота' });
       // Списываем золото
       await client.query('UPDATE users SET gold_balance = gold_balance - $1 WHERE id = $2', [product.price, user.id]);
    } else {
       if (user.balance < product.price) return res.status(400).json({ error: 'Не хватает серебра' });
       // Списываем серебро
       await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [product.price, user.id]);
    }

    // 3. Создаем заказ
    await client.query('INSERT INTO orders (user_id, product_id, price, currency) VALUES ($1, $2, $3, $4)', 
      [user.id, product.id, product.price, product.currency]);

    res.json({ success: true });
    
    // TODO: Здесь можно отправить уведомление админу в ТГ о новом заказе

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Buy error' });
  }
});

// --- ОСТАЛЬНЫЕ API (Новости, Проекты - оставляем) ---
// ... (Вставь сюда методы для /api/news, /api/projects, /api/sync-xml-url из старого файла) ...
// Они не изменились, просто перенеси их.

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
