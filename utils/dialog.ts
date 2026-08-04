import WebApp from '@twa-dev/sdk';

// window.confirm() и window.alert() в Telegram WebView заблокированы: confirm
// молча возвращает false, из-за чего «Удалить событие?» и прочие подтверждения
// в админке просто не срабатывали. Внутри Telegram используем нативные
// showConfirm/showAlert, вне Telegram — обычные браузерные диалоги.

function inTelegram(): boolean {
  try { return !!WebApp.initData; } catch { return false; }
}

export function confirmDialog(message: string): Promise<boolean> {
  if (inTelegram()) {
    return new Promise(resolve => {
      try {
        WebApp.showConfirm(message, (ok: boolean) => resolve(!!ok));
      } catch {
        // Старые клиенты Telegram без showConfirm (API < 6.2)
        resolve(window.confirm(message));
      }
    });
  }
  return Promise.resolve(window.confirm(message));
}

export function alertDialog(message: string): void {
  if (inTelegram()) {
    try { WebApp.showAlert(message); return; } catch {}
  }
  window.alert(message);
}
