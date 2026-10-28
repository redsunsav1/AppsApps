// Призы магазина, которые заводятся сами при старте сервера.
// Каждый приз создаётся один раз (по sku): после этого им управляет админ,
// и сервер его правки не перетирает. Если приз уже заведён руками до появления
// каталога, он находится по названию и получает sku вместо дубля.

export const PRIZE_CATALOG = [
  { sku: 'iphone-17-pro-max-1tb', title: 'iPhone 17 Pro Max 1\u00a0ТБ', price: 4, image: '/prizes/iphone.webp', match: '%iphone%' },
  { sku: 'apple-watch-s11', title: 'Apple Watch Series 11', price: 2, image: '/prizes/watch.webp', match: '%watch%' },
  { sku: 'airpods-max', title: 'AirPods Max', price: 1, image: '/prizes/airpods.webp', match: '%airpods%' },
  // Супер-приз скрыт: партнёры видят только размытое фото и «Скоро откроем».
  // Цену и остаток админ ставит, когда решит открыть приз.
  { sku: 'super-bali', title: 'Путешествие на Бали', price: 10, image: '/prizes/super.webp', match: '%бали%', teaser: true },
];

const TEASER_PUBLIC = { title: 'Супер-приз', image_url: '/prizes/super.webp' };

export async function ensurePrizeSchema(pool) {
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_teaser BOOLEAN DEFAULT FALSE;');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON products (sku) WHERE sku IS NOT NULL;');
}

export async function seedPrizeCatalog(pool) {
  for (const p of PRIZE_CATALOG) {
    const known = await pool.query('SELECT 1 FROM products WHERE sku = $1', [p.sku]);
    if (known.rowCount) continue;
    const manual = (await pool.query(
      'SELECT id FROM products WHERE sku IS NULL AND is_active = TRUE AND title ILIKE $1 ORDER BY id LIMIT 1',
      [p.match]
    )).rows[0];
    if (manual) {
      await pool.query(
        // У скрытого приза цену, заведённую руками, сохраняем: наша — лишь заглушка.
        "UPDATE products SET sku = $1, title = $2, price = CASE WHEN $5 THEN price ELSE $3 END, currency = 'GOLD', image_url = $4, stock = 1, is_teaser = $5 WHERE id = $6",
        [p.sku, p.title, p.price, p.image, !!p.teaser, manual.id]
      );
    } else {
      await pool.query(
        "INSERT INTO products (sku, title, price, currency, image_url, stock, is_teaser) VALUES ($1, $2, $3, 'GOLD', $4, 1, $5)",
        [p.sku, p.title, p.price, p.image, !!p.teaser]
      );
    }
  }
}

// Партнёру скрытый приз отдаём без названия, цены и настоящего фото,
// чтобы его нельзя было подсмотреть даже в ответе сервера.
export function publicProduct(row) {
  if (!row.is_teaser) return row;
  return { id: row.id, currency: row.currency, is_teaser: true, ...TEASER_PUBLIC, price: null, stock: null };
}
