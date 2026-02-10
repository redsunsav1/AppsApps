import WebApp from '@twa-dev/sdk';

const PWA_TOKEN_KEY = 'kp_pwa_token';

// --- Cookie helpers (cookies общие между Safari и standalone PWA на iOS) ---
function setCookie(name: string, value: string, days: number = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function getAuthData(): string {
  try {
    const initData = WebApp.initData;
    if (initData) return initData;
  } catch {}
  // PWA-режим: пробуем localStorage, потом cookie
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
