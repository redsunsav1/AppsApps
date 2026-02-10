import WebApp from '@twa-dev/sdk';

const PWA_TOKEN_KEY = 'kp_pwa_token';

export function getAuthData(): string {
  try {
    const initData = WebApp.initData;
    if (initData) return initData;
  } catch {}
  return localStorage.getItem(PWA_TOKEN_KEY) || '';
}

export function savePwaToken(token: string) {
  if (token) {
    try { localStorage.setItem(PWA_TOKEN_KEY, token); } catch {}
  }
}

export function getPwaToken(): string | null {
  try { return localStorage.getItem(PWA_TOKEN_KEY); } catch { return null; }
}

export function isTelegramEnv(): boolean {
  try { return !!WebApp.initData; } catch { return false; }
}
