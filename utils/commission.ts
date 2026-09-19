/**
 * Агентское вознаграждение риелтора.
 *
 * Приложение не знает о фактических выплатах — они идут по договору мимо него.
 * Поэтому здесь считается ОЖИДАЕМАЯ величина по ставке, и в интерфейсе она
 * подписывается именно так. Называть это «выплачено» нельзя: расхождение с
 * реальными деньгами подорвёт доверие сильнее, чем отсутствие цифры.
 */

export const DEFAULT_COMMISSION_PERCENT = 4;

/** Ставка приходит из настроек строкой; мусор и отрицательные значения отбрасываем. */
export function parseCommissionPercent(raw: unknown): number {
  const value = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0 || value > 100) return 0;
  return value;
}

export function calcCommission(price: number, percent: number): number {
  if (!(price > 0) || !(percent > 0)) return 0;
  return Math.round((price * percent) / 100);
}

export function formatCommission(value: number): string {
  if (!(value > 0)) return '';
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

export interface CommissionSummary {
  /** Брони в работе: сделка ещё не закрыта. */
  pending: number;
  pendingCount: number;
  /** Закрытые сделки — ожидаемое начисление, не факт выплаты. */
  closed: number;
  closedCount: number;
}

interface BookingLike {
  stage?: string;
  unit_price?: number | string | null;
}

/**
 * Считает сводку по броням риелтора. Отменённые сюда не попадают — сервер их
 * уже отфильтровал, но проверяем повторно: на клиенте дешевле, чем объяснять
 * риелтору, почему в «в работе» висит снятая бронь.
 */
export function summarizeCommission(bookings: BookingLike[], percent: number): CommissionSummary {
  const summary: CommissionSummary = { pending: 0, pendingCount: 0, closed: 0, closedCount: 0 };
  if (!Array.isArray(bookings) || !(percent > 0)) return summary;

  for (const booking of bookings) {
    const stage = booking?.stage || 'INIT';
    if (stage === 'CANCELLED') continue;
    const price = Number(booking?.unit_price);
    const amount = calcCommission(Number.isFinite(price) ? price : 0, percent);
    if (stage === 'COMPLETE') {
      summary.closed += amount;
      summary.closedCount += 1;
    } else {
      summary.pending += amount;
      summary.pendingCount += 1;
    }
  }
  return summary;
}

/** Склонение «сделка» для подписи под суммой. */
export function dealsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'сделка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'сделки';
  return 'сделок';
}
