
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Путь к БД. На Amvera используем монтируемую папку /data, локально - просто файл.
const dbPath = process.env.AMVERA ? '/data/partner_app.db' : 'partner_app.db';
const db = new Database(dbPath);

// Инициализация таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    avatar TEXT,
    level INTEGER DEFAULT 1,
    currentXP INTEGER DEFAULT 0,
    silverCoins INTEGER DEFAULT 0,
    goldCoins INTEGER DEFAULT 0,
    dealsClosed INTEGER DEFAULT 0,
    phone TEXT,
    telegram TEXT,
    whatsapp TEXT,
    isAdmin INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS mortgage (
    id TEXT PRIMARY KEY,
    data TEXT
  );

  CREATE TABLE IF NOT EXISTS shop (
    id TEXT PRIMARY KEY,
    data TEXT
  );
`);

export default db;
