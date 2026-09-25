// Импорт новостей с сайта застройщика (по умолчанию horoshogk.ru/news) в ленту приложения.
// Разбор опирается на стандартную разметку статьи (og:*, article:published_time,
// JSON-LD, <time>, <h1>, <p>), а не на классы конкретной вёрстки — так импорт
// переживает редизайн сайта. Сайт может не открываться из-за рубежа, поэтому
// импорт рассчитан на запуск с прод-сервера.

const UA = 'Mozilla/5.0 (compatible; PartnerBuildNewsBot/1.0)';
const FETCH_TIMEOUT_MS = 20000;
const MAX_LIST_PAGES = 5;
const MAX_ARTICLES_PER_RUN = 60;

const MONTHS = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.text();
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const stripTags = (html) => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function metaContent(html, key) {
  // Атрибуты property/name и content могут идти в любом порядке
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  if (!tag) return '';
  return decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] || '').trim();
}

function absUrl(href, base) {
  try { return new URL(decodeEntities(href), base).toString(); } catch { return ''; }
}

// Ссылки на отдельные новости: /news/<slug>, без самой ленты, пагинации и якорей
export function extractArticleLinks(html, listUrl) {
  const base = new URL(listUrl);
  const listPath = base.pathname.replace(/\/+$/, '') || '/news';
  const links = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    const u = absUrl(m[1], listUrl);
    if (!u) continue;
    const parsed = new URL(u);
    if (parsed.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    const p = parsed.pathname.replace(/\/+$/, '');
    if (!p.startsWith(listPath + '/')) continue;
    const rest = p.slice(listPath.length + 1);
    if (!rest || /^(page|p)(\/|$)/.test(rest)) continue;
    parsed.search = ''; parsed.hash = '';
    links.add(parsed.toString().replace(/\/+$/, ''));
  }
  return [...links];
}

function extractNextPages(html, listUrl) {
  const pages = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]*(?:[?&]page=\d+|\/page\/\d+|[?&]PAGEN_\d+=\d+)[^"'#]*)["']/gi)) {
    const u = absUrl(m[1], listUrl);
    if (u) pages.add(u);
  }
  return [...pages];
}

export function parseRuDate(str) {
  if (!str) return null;
  const s = String(str).toLowerCase();
  let m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 9));
  m = s.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], MONTHS[m[2]] - 1, +m[1], 9));
  return null;
}

function validDate(d) {
  return d instanceof Date && !isNaN(d) && d.getFullYear() > 2000 && d.getTime() <= Date.now() + 86400000 ? d : null;
}

function jsonLdField(html, field) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    const v = m[1].match(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`))?.[1];
    if (v) return v;
  }
  return '';
}

export function parseArticle(html, url) {
  const siteSuffix = /\s*[—–|-]\s*ГК\s*«?Хорошо»?\s*$/i;
  const title = stripTags(
    metaContent(html, 'og:title') || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || ''
  ).replace(siteSuffix, '').trim();

  // Текст: абзацы из <article>/<main>, иначе со всей страницы; отсекаем меню/футер по длине
  const scope = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html;
  const paragraphs = [...scope.replace(/<(script|style|nav|footer|header|form)[\s\S]*?<\/\1>/gi, '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => stripTags(m[1]))
    .filter(p => p.length >= 40 && !/cookie|персональных данных|политик/i.test(p));
  let text = [...new Set(paragraphs)].join('\n\n');
  if (!text) text = metaContent(html, 'og:description') || metaContent(html, 'description');

  const imgRaw = metaContent(html, 'og:image') || scope.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
  const image_url = imgRaw ? absUrl(imgRaw, url) : null;

  const date = validDate(new Date(metaContent(html, 'article:published_time') || jsonLdField(html, 'datePublished') || NaN))
    || validDate(new Date(html.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] || NaN))
    || validDate(parseRuDate(stripTags(scope).slice(0, 3000)));

  const project = (title + ' ' + text).match(/ЖК\s+[«"]?([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 -]{1,30}?)[»"]?(?=[\s,.!?:;)]|$)/);
  const project_name = project ? `ЖК ${project[1].trim()}` : null;

  return { title, text, image_url, date, project_name, source_url: url };
}

// Возвращает { found, added, skipped, errors[] }. Уведомлений не шлёт: импорт
// исторических новостей не должен превращаться в рассылку всем пользователям.
export async function importSiteNews(pool, { listUrl = process.env.NEWS_SOURCE_URL || 'https://horoshogk.ru/news', log = console } = {}) {
  const result = { found: 0, added: 0, skipped: 0, errors: [] };

  const seenPages = new Set([listUrl]);
  const queue = [listUrl];
  const articleLinks = new Set();
  while (queue.length && seenPages.size <= MAX_LIST_PAGES) {
    const pageUrl = queue.shift();
    const html = await fetchText(pageUrl); // ошибка ленты — фатальна, пусть всплывает
    extractArticleLinks(html, listUrl).forEach(l => articleLinks.add(l));
    for (const next of extractNextPages(html, listUrl)) {
      if (!seenPages.has(next) && seenPages.size < MAX_LIST_PAGES) { seenPages.add(next); queue.push(next); }
    }
  }
  const links = [...articleLinks];
  result.found = links.length;
  if (!links.length) throw new Error(`На ${listUrl} не найдено ссылок на новости — возможно, сменилась вёрстка`);

  const existing = await pool.query('SELECT source_url FROM news WHERE source_url = ANY($1)', [links]);
  const known = new Set(existing.rows.map(r => r.source_url));
  const fresh = links.filter(l => !known.has(l)).slice(0, MAX_ARTICLES_PER_RUN);
  result.skipped = links.length - fresh.length;

  for (const url of fresh) {
    try {
      const a = parseArticle(await fetchText(url), url);
      if (!a.title || !a.text) { result.errors.push(`${url}: не удалось выделить заголовок или текст`); continue; }
      const ins = await pool.query(
        `INSERT INTO news (title, text, image_url, project_name, progress, checklist, source_url, created_at)
         VALUES ($1, $2, $3, $4, 0, '[]'::jsonb, $5, COALESCE($6, NOW()))
         ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO NOTHING`,
        [a.title, a.text, a.image_url, a.project_name, url, a.date]
      );
      if (ins.rowCount) result.added++;
    } catch (e) {
      result.errors.push(`${url}: ${e.message}`);
    }
  }
  log.log?.(`News import: найдено ${result.found}, добавлено ${result.added}, ошибок ${result.errors.length}`);
  return result;
}
