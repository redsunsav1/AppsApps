import WebApp from '@twa-dev/sdk';

const PWA_TOKEN_KEY = 'kp_pwa_token';

/**
 * Возвращает строку для авторизации API-запросов:
 * - Внутри Telegram → initData (URL-encoded params с подписью)
 * - Вне Telegram (PWA) → pwa_token из localStorage (hex 64 символа)
 * Сервер через resolveAuth() обрабатывает оба формата прозрачно.
 */
export function getAuthData(): string {
  try {
    const initData = WebApp.initData;
    if (initData) return initData;
  } catch {}
  return localStorage.getItem(PWA_TOKEN_KEY) || '';
}

/** Сохранить PWA-токен, полученный при Telegram-авторизации */
export function savePwaToken(token: string) {
  if (token) {
    try { localStorage.setItem(PWA_TOKEN_KEY, token); } catch {}
  }
}

/** Получить сохранённый PWA-токен */
export function getPwaToken(): string | null {
  try { return localStorage.getItem(PWA_TOKEN_KEY); } catch { return null; }
}

/** Проверить, запущено ли приложение внутри Telegram */
export function isTelegramEnv(): boolean {
  try {
    return !!WebApp.initData;
  } catch {
    return false;
  }
}
