
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Increase limit for base64 images
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// --- SEED DEFAULT DATA IF EMPTY ---
const seedData = () => {
    try {
        // 1. NEWS
        const newsCount = db.prepare('SELECT count(*) as count FROM news').get();
        if (newsCount.count === 0) {
            console.log('Seeding default News...');
            const DEFAULT_NEWS = [
                {
                    id: '1',
                    title: 'Ход строительства: Октябрь 2023',
                    projectName: 'ЖК Бруклин',
                    description: 'Завершены работы по возведению монолитного каркаса 5-го этажа. Ведется кирпичная кладка стен и перегородок на 2-3 этажах.',
                    checklist: ['Монолит 5 этажа - 100%', 'Кладка стен - 40%', 'Остекление - 10%'],
                    materialsLink: '#',
                    images: ['https://images.unsplash.com/photo-1590644365607-1c5a38fc43e0?auto=format&fit=crop&q=80&w=1784'],
                    date: '12 Окт',
                    progress: 45
                },
                {
                    id: '2',
                    title: 'Старт продаж новой очереди',
                    projectName: 'ЖК Харизма',
                    description: 'Открыто бронирование квартир во 2-м корпусе. Доступны видовые квартиры на верхних этажах.',
                    checklist: ['Студии от 5.2 млн', 'Евро-2 от 7.5 млн', 'Ключи в 2025 году'],
                    materialsLink: '#',
                    images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&q=80&w=1770'],
                    date: '10 Окт',
                    progress: 0
                }
            ];
            const insert = db.prepare('INSERT INTO news (id, data) VALUES (?, ?)');
            const seedTransaction = db.transaction((items) => {
                for (const item of items) insert.run(item.id, JSON.stringify(item));
            });
            seedTransaction(DEFAULT_NEWS);
        }

        // 2. PROJECTS
        const projCount = db.prepare('SELECT count(*) as count FROM projects').get();
        if (projCount.count === 0) {
            console.log('Seeding default Projects...');
            const DEFAULT_PROJECTS = [
                {
                    id: 'p1',
                    name: 'ЖК Бруклин',
                    description: 'Квартал в стиле нью-йоркского лофта',
                    floors: 12,
                    unitsPerFloor: 8,
                    image: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&q=80&w=1000',
                    profitbaseUrl: ''
                },
                {
                    id: 'p2',
                    name: 'ЖК Харизма',
                    description: 'Бизнес-класс в центре событий',
                    floors: 24,
                    unitsPerFloor: 6,
                    image: 'https://images.unsplash.com/photo-1545558014-a15de98b6d1b?auto=format&fit=crop&q=80&w=1000',
                    profitbaseUrl: ''
                },
                {
                    id: 'p3',
                    name: 'ЖК Манхэттен',
                    description: 'Небоскребы с видом на парк',
                    floors: 35,
                    unitsPerFloor: 10,
                    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1000',
                    profitbaseUrl: ''
                }
            ];
            const insert = db.prepare('INSERT INTO projects (id, data) VALUES (?, ?)');
            const seedTransaction = db.transaction((items) => {
                for (const item of items) insert.run(item.id, JSON.stringify(item));
            });
            seedTransaction(DEFAULT_PROJECTS);
        }

        // 3. EVENTS
        const eventsCount = db.prepare('SELECT count(*) as count FROM events').get();
        if (eventsCount.count === 0) {
            console.log('Seeding default Events...');
             const DEFAULT_EVENTS = [
                {
                    id: 'e1',
                    title: 'Презентация ЖК Бруклин',
                    date: '25 Окт',
                    time: '11:00',
                    type: 'TOUR',
                    spotsTotal: 20,
                    spotsTaken: 15,
                    isRegistered: false
                },
                {
                    id: 'e2',
                    title: 'Тренинг: Работа с возражениями',
                    date: '28 Окт',
                    time: '14:00',
                    type: 'TRAINING',
                    spotsTotal: 50,
                    spotsTaken: 42,
                    isRegistered: false
                }
            ];
            const insert = db.prepare('INSERT INTO events (id, data) VALUES (?, ?)');
            const seedTransaction = db.transaction((items) => {
                for (const item of items) insert.run(item.id, JSON.stringify(item));
            });
            seedTransaction(DEFAULT_EVENTS);
        }

        // 4. MORTGAGE
        const mortCount = db.prepare('SELECT count(*) as count FROM mortgage').get();
        if (mortCount.count === 0) {
            console.log('Seeding default Mortgage...');
             const DEFAULT_MORTGAGE = [
                { id: 'm1', name: 'Семейная ипотека', rate: 6.0 },
                { id: 'm2', name: 'IT ипотека', rate: 5.0 },
                { id: 'm3', name: 'Господдержка', rate: 8.0 },
                { id: 'm4', name: 'Стандартная', rate: 18.0 }
            ];
            const insert = db.prepare('INSERT INTO mortgage (id, data) VALUES (?, ?)');
            const seedTransaction = db.transaction((items) => {
                for (const item of items) insert.run(item.id, JSON.stringify(item));
            });
            seedTransaction(DEFAULT_MORTGAGE);
        }

        // 5. SHOP
        const shopCount = db.prepare('SELECT count(*) as count FROM shop').get();
        if (shopCount.count === 0) {
            console.log('Seeding default Shop...');
            const DEFAULT_SHOP_ITEMS = [
                { id: 's1', name: 'Брендированный Худи', category: 'MERCH', price: 5000, currency: 'SILVER', image: '🧥', inStock: true },
                { id: 's2', name: 'Сертификат OZON 3000₽', category: 'EXPERIENCE', price: 15000, currency: 'SILVER', image: '💳', inStock: true },
                { id: 's3', name: 'Ужин в ресторане', category: 'EXPERIENCE', price: 30000, currency: 'SILVER', image: '🥂', inStock: true },
                { id: 's4', name: 'Apple AirPods Pro 2', category: 'TECH', price: 20, currency: 'GOLD', image: '🎧', inStock: true },
                { id: 's5', name: 'Apple Watch Ultra 2', category: 'TECH', price: 60, currency: 'GOLD', image: '⌚️', inStock: true },
                { id: 's6', name: 'iPhone 16 Pro Max', category: 'TECH', price: 120, currency: 'GOLD', image: '📱', inStock: true },
            ];
            const insert = db.prepare('INSERT INTO shop (id, data) VALUES (?, ?)');
            const seedTransaction = db.transaction((items) => {
                for (const item of items) insert.run(item.id, JSON.stringify(item));
            });
            seedTransaction(DEFAULT_SHOP_ITEMS);
        }

    } catch (e) {
        console.error("Seeding failed:", e);
    }
};

// --- GENERIC CRUD HANDLERS FOR JSON DATA ---
const createCRUDEndpoints = (resourceName, tableName) => {
    // GET ALL
    app.get(`/api/${resourceName}`, (req, res) => {
        const rows = db.prepare(`SELECT data FROM ${tableName}`).all();
        const items = rows.map(row => JSON.parse(row.data));
        res.json(items);
    });

    // SYNC
    app.post(`/api/${resourceName}/sync`, (req, res) => {
        const items = req.body; 
        
        const deleteStmt = db.prepare(`DELETE FROM ${tableName}`);
        const insertStmt = db.prepare(`INSERT INTO ${tableName} (id, data) VALUES (?, ?)`);
        
        const updateTransaction = db.transaction((items) => {
            deleteStmt.run();
            for (const item of items) {
                insertStmt.run(item.id, JSON.stringify(item));
            }
        });

        try {
            updateTransaction(items);
            res.json({ success: true });
        } catch(e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    });
};

// --- USER ENDPOINTS ---
app.get('/api/user/:id', (req, res) => {
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (row) {
        // Map DB columns back to JSON structure if needed, or if we stored as JSON string
        // Since we created specific columns in db.js, we return them directly
        res.json(row);
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

app.post('/api/user/sync', (req, res) => {
    const user = req.body;
    
    // Upsert user
    const insert = db.prepare(`
        INSERT INTO users (id, name, avatar, level, currentXP, silverCoins, goldCoins, dealsClosed, phone, telegram, whatsapp, isAdmin)
        VALUES (@id, @name, @avatar, @level, @currentXP, @silverCoins, @goldCoins, @dealsClosed, @phone, @telegram, @whatsapp, @isAdmin)
        ON CONFLICT(id) DO UPDATE SET
        level=@level, currentXP=@currentXP, silverCoins=@silverCoins, goldCoins=@goldCoins, dealsClosed=@dealsClosed
    `);

    try {
        insert.run({
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            level: user.level || 1,
            currentXP: user.currentXP || 0,
            silverCoins: user.silverCoins || 0,
            goldCoins: user.goldCoins || 0,
            dealsClosed: user.dealsClosed || 0,
            phone: user.phone || '',
            telegram: user.telegram || '',
            whatsapp: user.whatsapp || '',
            isAdmin: user.isAdmin ? 1 : 0
        });
        res.json({ success: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

createCRUDEndpoints('news', 'news');
createCRUDEndpoints('projects', 'projects');
createCRUDEndpoints('events', 'events');
createCRUDEndpoints('mortgage', 'mortgage');
createCRUDEndpoints('shop', 'shop');

// --- SERVE FRONTEND ---
// Serve public folder assets (icons, manifest, sw) with correct headers
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    if (filePath.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/');
  }
}));
app.use(express.static(path.join(__dirname, '../dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  seedData();
});
