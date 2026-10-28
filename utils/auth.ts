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

// PWA-сессия. Основная защита — HttpOnly-cookie kp_session, которую ставит сервер
// и которую JS прочитать не может. Эти клиентские хранилища нужны только для того,
// чтобы приложение пережило перезапуск (iOS «На экран Домой») и не потеряло вход.
// Флаг Secure ставим только на https: на http://localhost браузер отбросил бы cookie
// целиком и локальная разработка осталась бы без авторизации.
function setCookie(name: string, value: string, days: number = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  const isSecure = typeof location !== 'undefined' && location.protocol === 'https:';
  document.cookie =
    `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax${isSecure ? ';Secure' : ''}`;
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
  // 3. PWA-токен
  return readStoredToken() || '';
}

// Читаем токен из всех хранилищ по убыванию свежести и тут же восстанавливаем
// остальные. Токен из URL убран, поэтому потерянное здесь значение вернуть
// неоткуда — пользователю пришлось бы просить новую пригласительную ссылку.
// Поэтому ничего не удаляем, а только дозаполняем.
function readStoredToken(): string | null {
  let token: string | null = null;
  try { token = sessionStorage.getItem(PWA_TOKEN_KEY); } catch {}
  if (!token) {
    try { token = getCookie(PWA_TOKEN_KEY); } catch {}
  }
  if (!token) {
    // Сборки до сентября 2026 хранили токен только здесь.
    try { token = localStorage.getItem(PWA_TOKEN_KEY); } catch {}
  }
  if (token) persistToken(token);
  return token;
}

function persistToken(token: string) {
  try { sessionStorage.setItem(PWA_TOKEN_KEY, token); } catch {}
  try { if (getCookie(PWA_TOKEN_KEY) !== token) setCookie(PWA_TOKEN_KEY, token); } catch {}
  // localStorage — единственное хранилище, переживающее перезапуск standalone-PWA
  // на iOS, когда cookie уже подрезана ITP. Оставляем его как последний рубеж.
  try { if (localStorage.getItem(PWA_TOKEN_KEY) !== token) localStorage.setItem(PWA_TOKEN_KEY, token); } catch {}
}

export function savePwaToken(token: string) {
  if (token) persistToken(token);
}

export function getPwaToken(): string | null {
  return readStoredToken();
}

export function isTelegramEnv(): boolean {
  try { return !!WebApp.initData; } catch { return false; }
}

// --- PIN админки (второй фактор) ---
// PIN живёт в sessionStorage: переживает переходы внутри сессии,
// но не остаётся на устройстве после закрытия приложения.
const ADMIN_PIN_KEY = 'kp_admin_pin';

export function getAdminPin(): string {
  try { return sessionStorage.getItem(ADMIN_PIN_KEY) || ''; } catch { return ''; }
}

export function saveAdminPin(pin: string) {
  try { sessionStorage.setItem(ADMIN_PIN_KEY, pin); } catch {}
}

export function clearAdminPin() {
  try { sessionStorage.removeItem(ADMIN_PIN_KEY); } catch {}
}

// Глобальный перехватчик fetch: когда PIN введён, добавляет x-admin-pin ко всем
// запросам к нашему API. Так админские вызовы по всему приложению получают
// второй фактор без правки каждого места с fetch.
(function patchFetchForAdminPin() {
  if (typeof window === 'undefined') return;
  const w = window as any;
  if (w.__kpAdminPinFetchPatched) return;
  w.__kpAdminPinFetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const pin = getAdminPin();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      const isOwnApi = !!url && (url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`));
      if (pin && isOwnApi) {
        const headers = new Headers(init?.headers || (input instanceof Request ? (input as Request).headers : undefined));
        headers.set('x-admin-pin', pin);
        init = { ...init, headers };
      }
    } catch {}
    return origFetch(input as any, init);
  };
})();
