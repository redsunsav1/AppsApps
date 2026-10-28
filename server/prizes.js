// Призы магазина, которые заводятся сами при старте сервера.
// Каждый приз создаётся один раз (по sku): после этого им управляет админ,
// и сервер его правки не перетирает. Если приз уже заведён руками до появления
// каталога, он находится по названию и получает sku вместо дубля.

export const PRIZE_CATALOG = [
  { sku: 'iphone-17-pro-max-1tb', title: 'iPhone 17 Pro Max 1\u00a0ТБ', price: 4, image: '/prizes/iphone.webp', match: /iphone/i },
  { sku: 'apple-watch-s11', title: 'Apple Watch Series 11', price: 2, image: '/prizes/watch.webp', match: /watch/i },
  { sku: 'airpods-max', title: 'AirPods Max', price: 1, image: '/prizes/airpods.webp', match: /airpods/i },
  // Супер-приз скрыт: партнёры видят только размытое фото и «Скоро откроем».
  // Цену и остаток админ ставит, когда решит открыть приз.
  { sku: 'super-bali', title: 'Путешествие на Бали', price: 10, image: '/prizes/super.webp', match: /бали/i, teaser: true },
];

const TEASER_PUBLIC = { title: 'Супер-приз', image_url: '/prizes/super.webp' };

export async function ensurePrizeSchema(pool) {
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS is_teaser BOOLEAN DEFAULT FALSE;');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON products (sku) WHERE sku IS NOT NULL;');
}

// Название сверяем в JS, а не через ILIKE: база на проде без учёта регистра
// сравнивает только латиницу, и «Бали» не совпадал с «бали».
export async function seedPrizeCatalog(pool) {
  for (const p of PRIZE_CATALOG) {
    const manuals = (await pool.query(
      'SELECT id, title, created_at FROM products WHERE sku IS NULL AND is_active = TRUE ORDER BY id'
    )).rows;
    const manual = manuals.find((m) => p.match.test(m.title));
    const known = (await pool.query(
      'SELECT id, created_at, (SELECT COUNT(*) FROM orders o WHERE o.product_id = products.id)::int AS orders FROM products WHERE sku = $1',
      [p.sku]
    )).rows[0];
    if (known) {
      // Первая версия посева из-за ILIKE завела дубль рядом с призом, заведённым руками.
      // Пока на дубль нет заявок, снимаем его и забираем исходный приз. Товар,
      // заведённый позже нашего, не трогаем — это новый приз админа, а не дубль.
      if (!manual || known.orders > 0 || manual.created_at >= known.created_at) continue;
      await pool.query('UPDATE products SET sku = NULL, is_active = FALSE WHERE id = $1', [known.id]);
    }
    if (manual) {
      // У скрытого приза название, цену и фото, заведённые руками, сохраняем: их покажем, когда приз откроют.
      await pool.query(
        `UPDATE products SET sku = $1, title = CASE WHEN $5 THEN title ELSE $2 END, currency = 'GOLD', stock = 1, is_teaser = $5,
           price = CASE WHEN $5 THEN price ELSE $3 END,
           image_url = CASE WHEN $5 AND COALESCE(image_url, '') <> '' THEN image_url ELSE $4 END
         WHERE id = $6`,
        [p.sku, p.title, p.price, p.image, !!p.teaser, manual.id]
      );
    } else if (!known) {
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
