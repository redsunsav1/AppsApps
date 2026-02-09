// DOM-based toast notification utility
// Replaces all alert() calls with non-blocking toasts

let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'toast-container';
  container.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    z-index: 99999; display: flex; flex-direction: column; gap: 8px;
    align-items: center; pointer-events: none; width: 90%; max-width: 400px;
  `;
  document.body.appendChild(container);
  return container;
}

type ToastType = 'success' | 'error' | 'info';

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  success: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46' },
  error:   { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
  info:    { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af' },
};

const ICONS: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

export function showToast(message: string, type: ToastType = 'info', durationMs = 3000) {
  const c = getContainer();
  const colors = COLORS[type];

  const el = document.createElement('div');
  el.style.cssText = `
    background: ${colors.bg}; border: 1px solid ${colors.border}; color: ${colors.text};
    padding: 12px 16px; border-radius: 14px; font-size: 14px; font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12); pointer-events: auto;
    animation: toastIn 0.3s ease-out; display: flex; align-items: center; gap: 8px;
    max-width: 100%; word-break: break-word;
  `;
  el.innerHTML = `<span style="font-size:16px">${ICONS[type]}</span><span>${escapeHtml(message)}</span>`;

  // Add animation keyframes if not added
  if (!document.getElementById('toast-keyframes')) {
    const style = document.createElement('style');
    style.id = 'toast-keyframes';
    style.textContent = `
      @keyframes toastIn { from { opacity: 0; transform: translateY(-12px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes toastOut { from { opacity: 1; transform: translateY(0) scale(1); } to { opacity: 0; transform: translateY(-12px) scale(0.95); } }
    `;
    document.head.appendChild(style);
  }

  c.appendChild(el);

  setTimeout(() => {
    el.style.animation = 'toastOut 0.3s ease-in forwards';
    el.addEventListener('animationend', () => el.remove());
  }, durationMs);
}

function escapeHtml(str: string): string {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
