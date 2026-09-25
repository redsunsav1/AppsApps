// Импорт новостей с сайта застройщика (по умолчанию horoshogk.ru/news) в ленту приложения.
// Разбор опирается на стандартную разметку статьи (og:*, article:published_time,
// JSON-LD, <time>, <h1>, <p>), а не на классы конкретной вёрстки — так импорт
// переживает редизайн сайта. Сайт может не открываться из-за рубежа, поэтому
// импорт рассчитан на запуск с прод-сервера.

import crypto from 'crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 20000;
const MAX_LIST_PAGES = 5;
const MAX_ARTICLES_PER_RUN = 60;
const NEWS_SECTIONS = ['/news', '/novosti', '/press', '/press-center', '/articles', '/blog', '/events', '/akcii', '/promo'];

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
    // Сама лента или соседний раздел новостей (/novosti/, /press/…) + ещё сегмент
    const section = [listPath, ...NEWS_SECTIONS].find(sec => p.startsWith(sec + '/'));
    if (!section) continue;
    const rest = p.slice(section.length + 1);
    if (!rest || /^(page|p|tag|tags|category)(\/|$)/.test(rest)) continue;
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

  return { title, text, image_url, date, project_name: detectProject(title, text), source_url: url };
}

// ---------------------------------------------------------------------------
// Новости, встроенные в страницу данными (Next.js, Nuxt, JSON в <script>).
// На таких сайтах у новостей может не быть отдельных ссылок: список рисуется
// скриптом из этих данных, поэтому ищем в них массивы «похожих на новость»
// объектов — с заголовком и датой.
// ---------------------------------------------------------------------------

const TITLE_KEYS = ['title', 'name', 'heading', 'header', 'caption'];
const TEXT_KEYS = ['content', 'body', 'text', 'detail_text', 'detailText', 'description', 'preview_text', 'previewText', 'excerpt', 'lead', 'announce', 'anons', 'preview', 'subtitle', 'short_description', 'shortDescription'];
const IMAGE_KEYS = ['image', 'img', 'picture', 'cover', 'preview_image', 'previewImage', 'photo', 'thumbnail', 'thumb', 'poster', 'banner', 'images', 'gallery', 'media'];
const DATE_KEYS = ['date', 'published_at', 'publishedAt', 'publish_date', 'publishDate', 'published', 'created_at', 'createdAt', 'date_create', 'active_from', 'activeFrom', 'datePublished', 'updated_at'];
const LINK_KEYS = ['url', 'link', 'href', 'path', 'slug', 'code', 'uri', 'alias', 'id'];

function pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
  return undefined;
}

function imageFrom(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return imageFrom(v[0]);
  if (typeof v === 'object') return imageFrom(v.url || v.src || v.path || v.original || v.large || v.medium || v.data?.attributes?.url || v.data?.url || v.formats?.large?.url);
  return '';
}

function dateFrom(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return validDate(new Date(v < 1e12 ? v * 1000 : v));
  return validDate(new Date(v)) || validDate(parseRuDate(v));
}

function looksLikeNews(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const t = pick(o, TITLE_KEYS);
  if (typeof t !== 'string' || stripTags(t).length < 5 || t.length > 400) return false;
  if (!dateFrom(pick(o, DATE_KEYS))) return false;
  return pick(o, TEXT_KEYS) !== undefined || pick(o, IMAGE_KEYS) !== undefined || pick(o, LINK_KEYS) !== undefined;
}

// Nuxt 3 кладёт состояние в «плоский» массив, где значения — индексы в нём же
function resolveNuxtPayload(arr, idx = 0, depth = 0, seen = new Map()) {
  if (depth > 40) return null;
  if (seen.has(idx)) return seen.get(idx);
  let v = arr[idx];
  if (Array.isArray(v)) {
    if (typeof v[0] === 'string' && /^(Reactive|ShallowReactive|Ref|ShallowRef|EmptyRef|NuxtError|Set|Map|Date)$/.test(v[0])) {
      return v[0] === 'Date' ? v[1] : resolveNuxtPayload(arr, v[1], depth + 1, seen);
    }
    const out = []; seen.set(idx, out);
    for (const i of v) out.push(typeof i === 'number' ? resolveNuxtPayload(arr, i, depth + 1, seen) : i);
    return out;
  }
  if (v && typeof v === 'object') {
    const out = {}; seen.set(idx, out);
    for (const [k, i] of Object.entries(v)) out[k] = typeof i === 'number' ? resolveNuxtPayload(arr, i, depth + 1, seen) : i;
    return out;
  }
  return v;
}

// Достаёт JSON-объекты из произвольного текста (например, потока RSC у Next.js)
function scanJsonObjects(text, out) {
  const re = /\{"(?:title|name|heading)"|"(?:title|name|heading)":/g;
  const starts = new Set();
  for (const m of text.matchAll(re)) {
    // ищем ближайшую открывающую скобку объекта слева
    let i = m[0].startsWith('{') ? m.index : text.lastIndexOf('{', m.index);
    if (i >= 0) starts.add(i);
  }
  for (const start of starts) {
    let depth = 0, inStr = false;
    for (let i = start; i < text.length && i - start < 50000; i++) {
      const c = text[i];
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch {}
        break;
      }
    }
  }
}

function collectJsonBlobs(html) {
  const blobs = [];
  for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1], body = m[2].trim();
    if (!body) continue;
    if (/application\/(ld\+)?json/i.test(attrs) || /__NEXT_DATA__|__NUXT_DATA__/i.test(attrs)) {
      try {
        const data = JSON.parse(body);
        blobs.push(/__NUXT_DATA__/i.test(attrs) && Array.isArray(data) ? resolveNuxtPayload(data) : data);
      } catch {}
      continue;
    }
    if (body.includes('self.__next_f')) {
      let text = '';
      for (const s of body.matchAll(/self\.__next_f\.push\(\[\d+,\s*("(?:[^"\\]|\\.)*")\]\)/g)) {
        try { text += JSON.parse(s[1]); } catch {}
      }
      scanJsonObjects(text, blobs);
      continue;
    }
    // window.__INITIAL_STATE__ = {...}; и подобные
    const assign = body.match(/^(?:window\.)?__[A-Z_]+__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (assign) { try { blobs.push(JSON.parse(assign[1])); } catch {} }
  }
  return blobs;
}

// Текст новости бывает строкой с HTML или «богатым» JSON (блоки редактора)
function richText(v, depth = 0) {
  if (v === undefined || v === null || depth > 8) return '';
  if (typeof v === 'string') return stripTags(v.replace(/<\/(p|div|li|h\d)>|<br\s*\/?>/gi, '\n'));
  if (Array.isArray(v)) return v.map(x => richText(x, depth + 1)).filter(Boolean).join('\n\n');
  if (typeof v === 'object') return richText(v.text ?? v.content ?? v.children ?? v.blocks ?? v.data ?? v.value ?? v.html, depth + 1);
  return '';
}

function findNewsObjects(values) {
  const found = [];
  const seen = new WeakSet();
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || depth > 25 || seen.has(v)) return;
    seen.add(v);
    if (looksLikeNews(v)) { found.push(v); return; }
    for (const child of Array.isArray(v) ? v : Object.values(v)) walk(child, depth + 1);
  };
  for (const v of values) walk(v, 0);
  return found;
}

// Объекты-новости из любых данных (встроенных в страницу или из API сайта)
export function newsFromData(values, listUrl) {
  const origin = new URL(listUrl).origin + '/';
  const items = new Map();
  for (const o of findNewsObjects(values)) {
    const title = stripTags(pick(o, TITLE_KEYS));
    const date = dateFrom(pick(o, DATE_KEYS));
    const text = richText(pick(o, TEXT_KEYS));
    const img = imageFrom(pick(o, IMAGE_KEYS));
    let link = '';
    const l = pick(o, ['url', 'link', 'href', 'path', 'uri']);
    if (typeof l === 'string' && !/^https?:\/\/(?!([^/]*\.)?horoshogk\.ru)/i.test(l) && !/\.(jpe?g|png|webp|gif|pdf)$/i.test(l)) link = absUrl(l, origin);
    const slug = pick(o, ['slug', 'code', 'alias']);
    if (!link && (typeof slug === 'string' || typeof slug === 'number')) link = `${listUrl.replace(/\/+$/, '')}/${slug}`;
    const key = link || `${listUrl}#${crypto.createHash('sha1').update(title + (date?.toISOString() || '')).digest('hex').slice(0, 12)}`;
    if (!items.has(key)) {
      items.set(key, { title, text, image_url: img ? absUrl(img, origin) : null, date, source_url: key, detail_url: link || null, slug: slug ?? null, id: o.id ?? o._id ?? null });
    }
  }
  return [...items.values()];
}

export function extractEmbeddedNews(html, listUrl) {
  return newsFromData(collectJsonBlobs(html), listUrl);
}

// ---------------------------------------------------------------------------
// SPA-сайты (horoshogk.ru — Vite + /api) отдают пустую страницу, а новости
// грузят скриптом из API. Перебираем типичные адреса API и берём первый,
// в котором нашлись новости. Точный адрес можно задать NEWS_API_URL.
// ---------------------------------------------------------------------------

const API_CANDIDATES = [
  '/api/news', '/api/news?limit=100', '/api/news?per_page=100', '/api/news?pageSize=100',
  '/api/news/list', '/api/v1/news', '/api/public/news', '/api/news/published',
  '/api/posts?type=news', '/api/posts', '/api/articles', '/api/content/news',
];

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const body = await res.text();
  const type = res.headers.get('content-type') || '';
  const trimmed = body.trim();
  let json;
  // SPA на неизвестный адрес отдаёт index.html со статусом 200 — это не данные
  if (/json/i.test(type) || /^[[{]/.test(trimmed)) { try { json = JSON.parse(trimmed); } catch {} }
  return { status: res.status, type, json, sample: trimmed.slice(0, 160).replace(/\s+/g, ' ') };
}

function withPage(url, page) {
  const u = new URL(url);
  u.searchParams.set('page', String(page));
  return u.toString();
}

export async function fetchNewsFromApi(listUrl) {
  const origin = new URL(listUrl).origin;
  const tried = [];
  const candidates = process.env.NEWS_API_URL ? [process.env.NEWS_API_URL] : API_CANDIDATES;
  for (const path of candidates) {
    const url = absUrl(path, origin + '/');
    try {
      const r = await fetchJson(url);
      tried.push(`${path} → ${r.status} ${r.type.split(';')[0] || '?'} ${r.json ? 'JSON' : ''} ${r.sample.slice(0, 100)}`);
      if (r.status !== 200 || !r.json) continue;
      const items = new Map(newsFromData([r.json], listUrl).map(i => [i.source_url, i]));
      if (!items.size) continue;
      // Пагинация: добираем страницы, пока приходят новые новости
      for (let page = 2; page <= MAX_LIST_PAGES; page++) {
        const next = await fetchJson(withPage(url, page)).catch(() => null);
        const more = next?.json ? newsFromData([next.json], listUrl).filter(i => !items.has(i.source_url)) : [];
        if (!more.length) break;
        more.forEach(i => items.set(i.source_url, i));
      }
      return { items: [...items.values()], apiUrl: url, tried };
    } catch (e) {
      tried.push(`${path} → ${e.message}`);
    }
  }
  return { items: [], apiUrl: null, tried };
}

// Полный текст новости из API: /api/news/<slug> или /api/news/<id>
async function fetchApiDetail(apiUrl, item) {
  const base = new URL(apiUrl); base.search = '';
  const root = base.toString().replace(/\/(list|published)\/?$/, '').replace(/\/+$/, '');
  for (const key of [item.slug, item.id]) {
    if (key === null || key === undefined || key === '') continue;
    const r = await fetchJson(`${root}/${encodeURIComponent(key)}`).catch(() => null);
    if (!r?.json) continue;
    const [d] = newsFromData([r.json], 'https://x/news');
    if (d?.text) return d;
    const text = richText(r.json.content ?? r.json.body ?? r.json.text ?? r.json.data?.content);
    if (text) return { text };
  }
  return null;
}

// Сводка того, что сервер увидел на странице ленты — чтобы подогнать разбор,
// не имея доступа к сайту напрямую. Уходит только админу.
export function diagnosePage(html, url) {
  const hrefs = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]))];
  const own = hrefs.filter(h => h.startsWith('/') || h.includes(new URL(url).hostname)).filter(h => !/\.(css|js|png|jpe?g|svg|ico|webmanifest|woff2?)(\?|$)/i.test(h));
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)];
  const apiUrls = [...new Set([...html.matchAll(/["'`](\/api\/[^"'`\s]{2,120}|https?:\/\/[^"'`\s]*\/api\/[^"'`\s]{2,120})["'`]/g)].map(m => m[1]))].slice(0, 15);
  const visible = stripTags(html.replace(/<(script|style|svg|noscript)[\s\S]*?<\/\1>/gi, ' '));
  const dateAt = visible.search(/\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
  return [
    `URL: ${url}`,
    `HTML: ${html.length} симв., <title>: ${stripTags(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')}`,
    `Движок: ${[/__NEXT_DATA__/.test(html) && 'Next pages', /self\.__next_f/.test(html) && 'Next app', /__NUXT/.test(html) && 'Nuxt', /data-v-[0-9a-f]{6,}/.test(html) && 'Vue', /bitrix/i.test(html) && 'Bitrix', /wp-content/.test(html) && 'WordPress', /tilda/i.test(html) && 'Tilda', /id=["'](root|app)["']/.test(html) && 'SPA root'].filter(Boolean).join(', ') || 'не определён'}`,
    `Скриптов: ${scripts.length}; атрибуты: ${[...new Set(scripts.map(s => s[1].trim()).filter(Boolean))].slice(0, 12).join(' | ').slice(0, 600)}`,
    `API в коде: ${apiUrls.join(' , ') || 'нет'}`,
    `Свои ссылки (${own.length}): ${own.slice(0, 60).join(' ')}`,
    `Текст вокруг первой даты: ${dateAt >= 0 ? visible.slice(Math.max(0, dateAt - 300), dateAt + 500) : 'дат не найдено'}`,
    `Начало текста: ${visible.slice(0, 700)}`,
  ].join('\n').slice(0, 6000);
}

// Для SPA: адреса API, из которых сайт грузит данные, видны только в JS-бандлах
async function diagnoseScripts(html, url) {
  const srcs = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => absUrl(m[1], url))
    .filter(u => u && new URL(u).hostname.replace(/^www\./, '') === new URL(url).hostname.replace(/^www\./, '')).slice(0, 6);
  const found = new Set();
  const snippets = [];
  for (const src of srcs) {
    try {
      const js = await fetchText(src);
      for (const m of js.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+)?\/(?:api|wp-json|rest|graphql|bitrix\/services)[^"'`\s]{0,120})["'`]/g)) found.add(m[1]);
      for (const m of js.matchAll(/["'`]([^"'`\s]{0,60}news[^"'`\s]{0,60})["'`]/gi)) found.add(m[1]);
      // Куски кода вокруг обращений к API — по ним видно, как собирается адрес
      for (const re of [/["'`]\/api["'`]/g, /baseURL|VITE_API|apiUrl|API_URL/g, /["'`/]news["'`?/]/g]) {
        let n = 0;
        for (const m of js.matchAll(re)) {
          if (n++ >= 4) break;
          snippets.push(js.slice(Math.max(0, m.index - 120), m.index + 160).replace(/\s+/g, ' '));
        }
      }
    } catch {}
  }
  return `\nAPI в бандлах (${srcs.length} файлов): ${[...found].slice(0, 40).join(' , ') || 'нет'}`
    + `\nКод вокруг API:\n${[...new Set(snippets)].slice(0, 12).join('\n---\n')}`.slice(0, 5000);
}

async function insertNews(pool, a) {
  const ins = await pool.query(
    `INSERT INTO news (title, text, image_url, project_name, progress, checklist, source_url, created_at)
     VALUES ($1, $2, $3, $4, 0, '[]'::jsonb, $5, COALESCE($6, NOW()))
     ON CONFLICT (source_url) WHERE source_url IS NOT NULL DO NOTHING`,
    [a.title, a.text, a.image_url, a.project_name, a.source_url, a.date]
  );
  return ins.rowCount > 0;
}

function detectProject(title, text) {
  const m = (title + ' ' + text).match(/ЖК\s+[«"]?([A-Za-zА-Яа-яЁё0-9][A-Za-zА-Яа-яЁё0-9 -]{1,30}?)[»"]?(?=[\s,.!?:;)]|$)/);
  return m ? `ЖК ${m[1].trim()}` : null;
}

// Возвращает { found, added, skipped, errors[], mode }. Уведомлений не шлёт: импорт
// исторических новостей не должен превращаться в рассылку всем пользователям.
// Если новостей на странице не нашлось, бросает ошибку с полем diagnostics.
export async function importSiteNews(pool, { listUrl = process.env.NEWS_SOURCE_URL || 'https://horoshogk.ru/news', log = console } = {}) {
  const result = { found: 0, added: 0, skipped: 0, errors: [], mode: '' };

  const seenPages = new Set([listUrl]);
  const queue = [listUrl];
  const articleLinks = new Set();
  const embedded = new Map();
  let firstHtml = '';
  while (queue.length) {
    const pageUrl = queue.shift();
    const html = await fetchText(pageUrl); // ошибка ленты — фатальна, пусть всплывает
    if (!firstHtml) firstHtml = html;
    extractArticleLinks(html, listUrl).forEach(l => articleLinks.add(l));
    for (const it of extractEmbeddedNews(html, listUrl)) if (!embedded.has(it.source_url)) embedded.set(it.source_url, it);
    for (const next of extractNextPages(html, listUrl)) {
      if (!seenPages.has(next) && seenPages.size < MAX_LIST_PAGES) { seenPages.add(next); queue.push(next); }
    }
  }

  // Пустая SPA-страница: новости берём из API сайта
  let api = null;
  if (!embedded.size && !articleLinks.size) {
    api = await fetchNewsFromApi(listUrl);
    for (const it of api.items) embedded.set(it.source_url, it);
  }

  // Кандидаты: сначала встроенные данные (там уже есть дата и текст), затем ссылки
  const candidates = new Map();
  for (const it of embedded.values()) candidates.set(it.source_url, it);
  for (const l of articleLinks) if (!candidates.has(l)) candidates.set(l, { source_url: l, detail_url: l });
  result.mode = api?.apiUrl ? `API ${api.apiUrl}` : embedded.size ? `данные страницы (${embedded.size})` : 'ссылки';
  result.found = candidates.size;
  if (!candidates.size) {
    const err = new Error(`На ${listUrl} не найдено новостей — нужна подгонка разбора под вёрстку сайта`);
    err.diagnostics = diagnosePage(firstHtml, listUrl)
      + `\nОпрос API:\n${(api?.tried || []).join('\n')}`
      + await diagnoseScripts(firstHtml, listUrl);
    throw err;
  }

  const keys = [...candidates.keys()];
  const existing = await pool.query('SELECT source_url FROM news WHERE source_url = ANY($1)', [keys]);
  const known = new Set(existing.rows.map(r => r.source_url));
  const fresh = keys.filter(k => !known.has(k)).slice(0, MAX_ARTICLES_PER_RUN);
  result.skipped = keys.length - fresh.length;

  for (const key of fresh) {
    const c = candidates.get(key);
    try {
      let a = { ...c };
      // Из API ленты часто приходит только анонс — полный текст из API новости
      if (api?.apiUrl && (!c.text || c.text.length < 300)) {
        const d = await fetchApiDetail(api.apiUrl, c).catch(() => null);
        if (d?.text && d.text.length > (a.text || '').length) a.text = d.text;
        a.image_url = a.image_url || d?.image_url || null;
      }
      // Из ленты часто приходит только анонс — полный текст берём со страницы новости
      // (у SPA страница новости пустая, её не трогаем)
      else if (c.detail_url && (!c.text || c.text.length < 300)) {
        try {
          const d = parseArticle(await fetchText(c.detail_url), c.detail_url);
          a = {
            ...a,
            title: a.title || d.title,
            text: (d.text && d.text.length > (a.text || '').length) ? d.text : a.text,
            image_url: a.image_url || d.image_url,
            date: a.date || d.date,
          };
        } catch (e) {
          if (!a.title || !a.text) throw e;
        }
      }
      if (!a.title || !a.text) { result.errors.push(`${key}: не удалось выделить заголовок или текст`); continue; }
      a.project_name = detectProject(a.title, a.text);
      if (await insertNews(pool, a)) result.added++;
    } catch (e) {
      result.errors.push(`${key}: ${e.message}`);
    }
  }
  log.log?.(`News import (${result.mode}): найдено ${result.found}, добавлено ${result.added}, ошибок ${result.errors.length}`);
  return result;
}
