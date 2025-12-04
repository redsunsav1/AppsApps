import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js'; // Импортируем парсер

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

// Увеличиваем лимит JSON, чтобы пролез большой XML
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

    // ТАБЛИЦЫ ПОЛЬЗОВАТЕЛЕЙ И НОВОСТЕЙ (Твои старые)
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

    // --- НОВЫЕ ТАБЛИЦЫ ДЛЯ ШАХМАТКИ ---
    
    // 1. Проекты (ЖК)
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, -- Например 'brk' (вручную или из фида)
        name TEXT NOT NULL,
        floors INT DEFAULT 1,
        units_per_floor INT DEFAULT 4,
        image_url TEXT
      );
    `);

    // 2. Квартиры (Units)
    await client.query(`
      CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY,   -- Уникальный ID квартиры из фида
        project_id TEXT,       -- Ссылка на проект
        floor INT,
        number TEXT,
        rooms INT,
        area NUMERIC,
        price NUMERIC,
        status TEXT,           -- FREE, BOOKED, SOLD
        plan_image_url TEXT,   -- Планировка
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ Database schema checked');
  } catch (err) {
    console.error('❌ DB Error:', err);
  }
};

initDb();

// ... (ТВОИ СТАРЫЕ API AUTH/REGISTER/NEWS ОСТАВЛЯЕМ) ...
// Я их свернул для краткости, но они должны тут быть.
// Если ты копируешь весь файл - вставь сюда методы из предыдущей версии server.js
// (app.post('/api/auth'...), app.post('/api/register'...), app.get('/api/news'...) и т.д.)

// --- ВСТАВЬ ЭТОТ БЛОК ПОСЛЕ НОВОСТЕЙ ---

// 1. Получить список проектов
app.get('/api/projects', async (req, res) => {
  try {
    const result = await client.query('SELECT * FROM projects');
    // Если проектов нет, вернем дефолтные для теста
    if (result.rows.length === 0) {
      return res.json([
        { id: 'brk', name: 'ЖК Бруклин', floors: 12, units_per_floor: 6, image_url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00' },
        { id: 'mnht', name: 'ЖК Манхэттен', floors: 24, units_per_floor: 8, image_url: 'https://images.unsplash.com/photo-1464938050520-ef2270bb8ce8' }
      ]);
    }
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 2. Получить квартиры конкретного проекта
app.get('/api/units/:projectId', async (req, res) => {
  const { projectId } = req.params;
  try {
    const result = await client.query('SELECT * FROM units WHERE project_id = $1', [projectId]);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 3. (АДМИН) Загрузка XML Фида (Profitbase)
app.post('/api/sync-xml', async (req, res) => {
  const { xmlContent, projectId } = req.body; // Мы пока будем слать XML текстом для простоты
  
  if (!xmlContent || !projectId) return res.status(400).json({ error: 'No XML or Project ID' });

  try {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);

    // Логика разбора (зависит от формата, тут пример стандартного YRL/Profitbase)
    // Допустим, структура: <offer internal-id="123"> <price>...</price> ... </offer>
    
    // Это примерная структура, её нужно будет подточить под твой реальный XML
    // Но для старта она подойдет (или мы загрузим фейковые данные)
    
    const offers = result?.realty_feed?.offer || [];
    let count = 0;

    for (const offer of offers) {
        // Парсим данные
        const unitId = offer.$?.['internal-id'] || Math.random().toString();
        const price = offer.price?.[0]?.value?.[0] || 0;
        const floor = parseInt(offer.floor?.[0] || '1');
        const rooms = parseInt(offer.rooms?.[0] || '1');
        const area = parseFloat(offer.area?.[0]?.value?.[0] || '0');
        const number = offer.flat_number?.[0] || '0';
        
        // Статус (нужно мапить)
        // Profitbase обычно шлет 'available', 'booked', 'sold'
        let status = 'FREE'; 
        // Тут можно добавить логику проверки статуса

        // Сохраняем в базу (Upsert - обновить если есть)
        await client.query(`
            INSERT INTO units (id, project_id, floor, number, rooms, area, price, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE 
            SET price = EXCLUDED.price, status = EXCLUDED.status;
        `, [unitId, projectId, floor, number, rooms, area, price, status]);
        
        count++;
    }

    res.json({ success: true, imported: count });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'XML Parse Error' });
  }
});

// 4. (АДМИН) Кнопка "Сгенерировать демо-квартиры" (Чтобы не возиться с XML прямо сейчас)
app.post('/api/generate-demo/:projectId', async (req, res) => {
    const { projectId } = req.params;
    const { floors, unitsPerFloor } = req.body; // 12, 6

    // Сначала создадим проект
    await client.query(`
        INSERT INTO projects (id, name, floors, units_per_floor)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO NOTHING
    `, [projectId, 'Demo Project', floors, unitsPerFloor]);

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
                `${projectId}-${f}-${u}`, 
                projectId, 
                f, 
                `${f}0${u}`, 
                Math.floor(Math.random() * 3) + 1, 
                Math.floor(Math.random() * 40) + 30, 
                Math.floor(Math.random() * 5000000) + 5000000, 
                status
            ]);
        }
    }
    res.json({ success: true });
});

// ... (ОСТАЛЬНОЙ КОД server.js: make-admin, listen...) ...
// Обязательно верни сюда все функции из твоего старого файла!

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
