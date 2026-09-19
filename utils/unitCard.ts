import { ChessUnit, ProjectData, MortgageProgram } from '../types';
import { roomLabel } from './chessboard';

export interface CardAgent {
  name: string;
  lastName?: string;
  company?: string;
  phone?: string;
}

// Условия расчёта показываем на карточке: платёж без них — пустая цифра,
// а клиент сравнивает предложения именно по ним.
export const CARD_DOWN_PAYMENT_PCT = 20;
export const CARD_TERM_YEARS = 30;

/** Аннуитетный платёж — та же формула, что в калькуляторе приложения. */
export function calcMonthlyPayment(
  price: number,
  ratePercent: number,
  downPct: number = CARD_DOWN_PAYMENT_PCT,
  termYears: number = CARD_TERM_YEARS
): number {
  if (!(price > 0) || !(ratePercent > 0) || !(termYears > 0)) return 0;
  const loan = price * (1 - downPct / 100);
  if (loan <= 0) return 0;
  const monthlyRate = ratePercent / 12 / 100;
  const months = termYears * 12;
  const x = Math.pow(1 + monthlyRate, months);
  const monthly = (loan * x * monthlyRate) / (x - 1);
  return Number.isFinite(monthly) ? Math.round(monthly) : 0;
}

/** Самая низкая ставка из активных программ — её и показываем как «от». */
export function bestRate(programs: MortgageProgram[]): number | null {
  const rates = (programs || []).map(p => Number(p.rate)).filter(r => Number.isFinite(r) && r > 0);
  return rates.length ? Math.min(...rates) : null;
}

export function formatRub(value: number): string {
  if (!(value > 0)) return '';
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export function agentFullName(agent?: CardAgent): string {
  if (!agent) return '';
  return [agent.name, agent.lastName].filter(Boolean).join(' ').trim();
}

/** Текстовая версия — для копирования и как подпись к картинке при отправке. */
export function buildUnitText(
  unit: ChessUnit,
  project: ProjectData | null,
  agent?: CardAgent,
  monthly?: number
): string {
  const lines: string[] = [];
  if (project?.name) lines.push(project.name);
  lines.push(`${roomLabel(unit.rooms)}${unit.area > 0 ? `, ${unit.area} м²` : ''}`);

  const meta = [`${unit.floor} этаж`];
  if (unit.section) meta.push(unit.section);
  meta.push(`кв. ${unit.number}`);
  lines.push(meta.join(' · '));

  if (unit.price > 0) lines.push(`Стоимость: ${formatRub(unit.price)}`);
  if (monthly && monthly > 0) {
    lines.push(`Ипотека от ${formatRub(monthly)}/мес (взнос ${CARD_DOWN_PAYMENT_PCT}%, срок ${CARD_TERM_YEARS} лет)`);
  }

  const who = agentFullName(agent);
  if (who || agent?.phone) {
    lines.push('');
    if (who) lines.push(who);
    if (agent?.company) lines.push(agent.company);
    if (agent?.phone) lines.push(agent.phone);
  }
  if (project?.developerName) {
    lines.push('');
    lines.push(`Реклама. Застройщик: ${project.developerName}`);
  }
  return lines.join('\n');
}

export function cardFileName(unit: ChessUnit, project: ProjectData | null): string {
  const base = [project?.name, `кв-${unit.number}`].filter(Boolean).join('-');
  return `${base.replace(/[^\wа-яА-ЯёЁ-]+/g, '-').replace(/-+/g, '-')}.png`;
}

// =============================================
// ОТРИСОВКА КАРТОЧКИ
// =============================================

const W = 1080;
const H = 1350;
const PALETTE = {
  cream: '#F2EBDF',
  white: '#FDFBF7',
  light: '#EAE0D5',
  black: '#433830',
  grey: '#939392',
  gold: '#BA8F50',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function font(weight: number, size: number) {
  return `${weight} ${size}px Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
}

/** Обрезает строку по ширине, добавляя многоточие: длинные названия ЖК не должны уезжать за край. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * Планировку грузим с crossOrigin: если у хранилища застройщика нет CORS-заголовков,
 * картинка не загрузится — и это лучше, чем «отравленный» canvas, с которого
 * нельзя снять изображение вообще.
 */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    // Битая ссылка не должна держать риелтора в ожидании.
    setTimeout(() => resolve(img.complete && img.naturalWidth > 0 ? img : null), 6000);
  });
}

export async function renderUnitCard(
  unit: ChessUnit,
  project: ProjectData | null,
  agent: CardAgent | undefined,
  monthly: number
): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  try { await (document as any).fonts?.ready; } catch { /* шрифт не критичен */ }

  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, W, H);

  const M = 48;
  const footerH = 176;
  ctx.fillStyle = PALETTE.white;
  roundRect(ctx, M, M, W - M * 2, H - M * 2, 56);
  ctx.fill();

  const inner = M + 56;
  const innerW = W - inner * 2;
  let y = M + 96;

  // Проект и застройщик
  ctx.fillStyle = PALETTE.black;
  ctx.font = font(800, 54);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fitText(ctx, project?.name || 'Объект', innerW), inner, y);
  y += 44;

  if (project?.developerName) {
    ctx.fillStyle = PALETTE.grey;
    ctx.font = font(500, 26);
    ctx.fillText(fitText(ctx, `Реклама · Застройщик: ${project.developerName}`, innerW), inner, y);
    y += 40;
  } else {
    y += 12;
  }

  // Планировку растягиваем на всё свободное место: иначе карточка без ипотеки
  // или без контактов остаётся с пустым провалом внизу.
  const who = agentFullName(agent);
  const hasFooter = Boolean(who || agent?.phone);
  const footerTop = hasFooter ? H - M - footerH : H - M;
  const reserved =
    76 +                              // отступ до блока с характеристиками
    44 +                              // комнатность и площадь
    84 +                              // этаж, секция, номер
    (unit.price > 0 ? 46 : 0) +
    (monthly > 0 ? 40 : 0) +
    56;                               // нижнее поле
  const planH = Math.max(280, Math.min(660, footerTop - y - reserved));
  ctx.fillStyle = PALETTE.light;
  roundRect(ctx, inner, y, innerW, planH, 36);
  ctx.fill();

  const plan = await loadImage(unit.layoutImage || '');
  if (plan && plan.naturalWidth > 0) {
    const pad = 32;
    const boxW = innerW - pad * 2;
    const boxH = planH - pad * 2;
    const scale = Math.min(boxW / plan.naturalWidth, boxH / plan.naturalHeight);
    const dw = plan.naturalWidth * scale;
    const dh = plan.naturalHeight * scale;
    ctx.drawImage(plan, inner + (innerW - dw) / 2, y + (planH - dh) / 2, dw, dh);
  } else {
    ctx.fillStyle = PALETTE.grey;
    ctx.font = font(600, 28);
    ctx.textAlign = 'center';
    ctx.fillText('Планировка по запросу', inner + innerW / 2, y + planH / 2 + 10);
    ctx.textAlign = 'left';
  }
  y += planH + 76;

  // Комнатность и площадь
  ctx.fillStyle = PALETTE.black;
  ctx.font = font(800, 62);
  ctx.fillText(`${roomLabel(unit.rooms)}${unit.area > 0 ? ` · ${unit.area} м²` : ''}`, inner, y);
  y += 44;

  // Этаж, секция, номер
  const meta = [`${unit.floor} этаж`];
  if (unit.section) meta.push(unit.section);
  meta.push(`кв. ${unit.number}`);
  ctx.fillStyle = PALETTE.grey;
  ctx.font = font(500, 30);
  ctx.fillText(fitText(ctx, meta.join('  ·  '), innerW), inner, y);
  y += 84;

  // Цена
  if (unit.price > 0) {
    ctx.fillStyle = PALETTE.black;
    ctx.font = font(900, 78);
    ctx.fillText(formatRub(unit.price), inner, y);
    y += 46;
  }

  if (monthly > 0) {
    ctx.fillStyle = PALETTE.gold;
    ctx.font = font(700, 29);
    ctx.fillText(
      `Ипотека от ${formatRub(monthly)}/мес · взнос ${CARD_DOWN_PAYMENT_PCT}%, ${CARD_TERM_YEARS} лет`,
      inner, y
    );
  }

  // Подвал с контактами риелтора
  if (hasFooter) {
    const fy = H - M - footerH;
    ctx.fillStyle = PALETTE.black;
    roundRect(ctx, M, fy, W - M * 2, footerH, 56);
    ctx.fill();
    ctx.fillRect(M, fy, W - M * 2, 56); // стыкуем со скруглением панели выше

    ctx.fillStyle = PALETTE.white;
    ctx.font = font(800, 38);
    ctx.fillText(fitText(ctx, who || 'Ваш менеджер', innerW), inner, fy + 74);

    const contact = [agent?.company, agent?.phone].filter(Boolean).join('  ·  ');
    if (contact) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = font(600, 30);
      ctx.fillText(fitText(ctx, contact, innerW), inner, fy + 120);
    }
  }

  return new Promise<Blob | null>(resolve => {
    try { canvas.toBlob(blob => resolve(blob), 'image/png'); }
    catch { resolve(null); }
  });
}

export type ShareOutcome = 'shared' | 'downloaded' | 'failed';

/**
 * Пытаемся отдать картинку системным «Поделиться» — оттуда она уходит в WhatsApp
 * или Telegram одним касанием. Если браузер не умеет делиться файлами, сохраняем.
 */
export async function shareUnitCard(blob: Blob, fileName: string, text: string): Promise<ShareOutcome> {
  const nav = navigator as any;
  try {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], text });
      return 'shared';
    }
  } catch (e: any) {
    // Пользователь закрыл системное окно — это не ошибка, второй раз не предлагаем.
    if (e?.name === 'AbortError') return 'shared';
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
