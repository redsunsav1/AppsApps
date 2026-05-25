import WebApp from '@twa-dev/sdk';

const PWA_TOKEN_KEY = 'kp_pwa_token';

// Тип платформы — для маршрутизации на бэке и UI-различий
export type Platform = 'telegram' | 'max' | 'pwa';

// --- MAX Messenger Bridge ---
// SDK подключается в index.html: https://st.max.ru/js/max-web-app.js
function getMaxBridge(): any {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  if (w.maxBridge) return w.maxBridge;
  if (w.MAX && typeof w.MAX === 'object') return w.MAX;
  const tgWebApp = w.Telegram?.WebApp;
  if (w.WebApp && w.WebApp !== tgWebApp) return w.WebApp;
  return null;
}

// MAX передаёт данные через URL-хеш: #WebAppData=<url-encoded-params>
// Формат: ip=...&user={"id":123,"first_name":"..."}[&hash=...]
function getMaxHashData(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return '';
  try {
    const params = new URLSearchParams(hash);
    const webAppData = params.get('WebAppData');
    if (webAppData) return webAppData;
  } catch {
    // Fallback below handles old/simple hash formats.
  }
  if (!hash.startsWith('WebAppData=')) return '';
  return hash.slice('WebAppData='.length).split('&WebAppPlatform=')[0].split('&WebAppVersion=')[0];
}

function getMaxInitData(): string {
  // 1. JS bridge (Android / desktop MAX)
  const bridge = getMaxBridge();
  if (bridge) {
    const d = bridge.initData || bridge.startParams || bridge.start_params || '';
    if (d) return d;
  }
  // 2. URL hash (iOS MAX: #WebAppData=...)
  return getMaxHashData();
}

export function isMaxEnv(): boolean {
  // JS bridge + данные
  if (!!getMaxBridge() && !!getMaxInitData()) return true;
  // URL hash — MAX на iOS передаёт данные так
  if (!!getMaxHashData()) return true;
  return false;
}

function hasMaxLaunchParams(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;
  try {
    const params = new URLSearchParams(hash);
    return params.has('WebAppData') || params.has('WebAppPlatform') || params.has('WebAppVersion');
  } catch {
    return hash.includes('WebAppData=');
  }
}

// User-Agent содержит MAX/версия — точное определение платформы
export function isMaxUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /MAX\/\d/i.test(navigator.userAgent);
}

// Эвристика для UI (не для авторизации)
export function isMaybeMaxContext(): boolean {
  if (isMaxEnv()) return true;
  if (hasMaxLaunchParams()) return true;
  if (isMaxUA()) return true;
  return false;
}

export function waitForMaxInitData(timeoutMs = 1200): Promise<string> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const data = getMaxInitData();
      if (data || Date.now() - startedAt >= timeoutMs) {
        resolve(data);
        return;
      }
      window.setTimeout(tick, 50);
    };
    tick();
  });
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
