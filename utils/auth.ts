import WebApp from '@twa-dev/sdk';

const PWA_TOKEN_KEY = 'kp_pwa_token';

// Тип платформы — для маршрутизации на бэке и UI-различий
export type Platform = 'telegram' | 'max' | 'pwa';

// --- MAX Messenger Bridge ---
// SDK инжектируется WebView'ом MAX при открытии мини-приложения.
// Документация: https://dev.max.ru/docs/webapps
// Точное имя глобального объекта может отличаться — поэтому пробуем несколько.
function getMaxBridge(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  // Явные имена MAX SDK
  if (w.maxBridge) return w.maxBridge;
  if (w.MAX && typeof w.MAX === 'object') return w.MAX;
  // MAX инжектирует window.WebApp как ОТДЕЛЬНЫЙ объект от window.Telegram.WebApp.
  // Даже если Telegram SDK загружен и установил window.Telegram, MAX всё равно
  // ставит свой window.WebApp — они разные объекты по ссылке.
  const tgWebApp = w.Telegram?.WebApp;
  if (w.WebApp && w.WebApp !== tgWebApp) return w.WebApp;
  return null;
}

function getMaxInitData(): string {
  const bridge = getMaxBridge();
  if (!bridge) return '';
  // Различные варианты доступа в зависимости от версии SDK
  return bridge.initData || bridge.startParams || bridge.start_params || '';
}

export function isMaxEnv(): boolean {
  return !!getMaxBridge() && !!getMaxInitData();
}

// Эвристика: возможно открыто в MAX (по UserAgent или наличию bridge без initData).
// Используется только для UI — не для авторизации.
export function isMaybeMaxContext(): boolean {
  if (isMaxEnv()) return true;
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // MAX использует WebView на базе Chromium; VK/Mail.ru — разработчики
  if (/VKMAX|VKWebView|MaxMessenger|max\.ru/i.test(ua)) return true;
  // Если bridge есть (но без initData — URL ещё не зарегистрирован в MAX)
  if (getMaxBridge()) return true;
  return false;
}

// MAX SDK инициализация (аналог WebApp.ready() / WebApp.expand() в Telegram).
// Тихо игнорирует отсутствие методов — если SDK ограниченный.
export function initMaxBridge(): void {
  try {
    const bridge = getMaxBridge();
    if (!bridge) return;
    if (typeof bridge.ready === 'function') bridge.ready();
    if (typeof bridge.expand === 'function') bridge.expand();
  } catch (e) {
    console.warn('MAX bridge init error:', e);
  }
}

// --- Cookie helpers (cookies общие между Safari и standalone PWA на iOS) ---
function setCookie(name: string, value: string, days: number = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Определение текущей платформы (для UI и API-вызовов)
export function detectPlatform(): Platform {
  try {
    if (WebApp.initData) return 'telegram';
  } catch {}
  if (isMaxEnv()) return 'max';
  return 'pwa';
}

// Получение initData в зависимости от окружения.
// Telegram-логика не изменена: сначала пробуем TG, потом MAX, потом PWA-токен.
export function getAuthData(): string {
  // 1. Telegram
  try {
    const initData = WebApp.initData;
    if (initData) return initData;
  } catch {}
  // 2. MAX
  try {
    const maxData = getMaxInitData();
    if (maxData) return maxData;
  } catch {}
  // 3. PWA: localStorage → cookie
  try {
    const ls = localStorage.getItem(PWA_TOKEN_KEY);
    if (ls) return ls;
  } catch {}
  return getCookie(PWA_TOKEN_KEY) || '';
}

export function savePwaToken(token: string) {
  if (token) {
    try { localStorage.setItem(PWA_TOKEN_KEY, token); } catch {}
    try { setCookie(PWA_TOKEN_KEY, token); } catch {}
  }
}

export function getPwaToken(): string | null {
  // Пробуем localStorage, потом cookie
  try {
    const ls = localStorage.getItem(PWA_TOKEN_KEY);
    if (ls) return ls;
  } catch {}
  try {
    return getCookie(PWA_TOKEN_KEY);
  } catch {}
  return null;
}

export function isTelegramEnv(): boolean {
  try { return !!WebApp.initData; } catch { return false; }
}
