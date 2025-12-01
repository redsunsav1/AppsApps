import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// Настройка путей для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const { Client } = pg;

// Разрешаем JSON и запросы с фронтенда
app.use(express.json());
app.use(cors());

// Раздаем статические файлы (ваше приложение) из папки dist
app.use(express.static(path.join(__dirname, 'dist')));

// --- ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ ---
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Нужно для Amvera/Cloud баз
});

client.connect()
  .then(() => console.log('✅ Connected to Database'))
  .catch(err => console.error('❌ DB Connection Error:', err));

// Создаем таблицу пользователей при старте (если её нет)
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    balance INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;
client.query(createTableQuery);

// --- ФУНКЦИЯ ПРОВЕРКИ ПОДПИСИ TELEGRAM (ВАЖНО!) ---
const verifyTelegramWebAppData = (telegramInitData) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is missing');

  const urlParams = new URLSearchParams(telegramInitData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  // Сортируем параметры
  const params = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  // Генерируем секретный ключ и хеш
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(params).digest('hex');

  return calculatedHash === hash;
};

// --- API: РЕГИСТРАЦИЯ / ВХОД ---
app.post('/api/auth', async (req, res) => {
  const { initData } = req.body;

  if (!initData) return res.status(400).json({ error: 'No data' });

  try {
    // 1. Проверяем подлинность (Защита от хакеров)
    // Если тестируете локально без токена - закомментируйте проверку, но НЕ ЗАБУДЬТЕ ВКЛЮЧИТЬ В ПРОДАКШЕНЕ
    const isValid = verifyTelegramWebAppData(initData);
    if (!isValid) return res.status(403).json({ error: 'Invalid signature' });

    // 2. Достаем данные юзера
    const urlParams = new URLSearchParams(initData);
    const user = JSON.parse(urlParams.get('user'));

    // 3. Работаем с БД
    // Проверяем, есть ли юзер
    const findQuery = 'SELECT * FROM users WHERE telegram_id = $1';
    const findResult = await client.query(findQuery, [user.id]);

    if (findResult.rows.length > 0) {
      // Юзер старый — возвращаем профиль
      return res.json({ user: findResult.rows[0], status: 'exists' });
    } else {
      // Юзер новый — создаем
      const insertQuery = `
        INSERT INTO users (telegram_id, username, first_name)
        VALUES ($1, $2, $3)
        RETURNING *
      `;
      const insertResult = await client.query(insertQuery, [user.id, user.username, user.first_name]);
      return res.json({ user: insertResult.rows[0], status: 'created' });
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Любой другой запрос возвращает index.html
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
