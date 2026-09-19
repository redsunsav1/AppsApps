import { ChessUnit } from '../types';

// =============================================
// ФИЛЬТР ПОДБОРА
// =============================================

export interface UnitFilter {
  /** Комнатность: 0 — студия. Пустой массив — любая. */
  rooms: number[];
  /** Потолок цены в рублях. */
  maxPrice: number | null;
  /** Минимальная площадь, м². */
  minArea: number | null;
  floorFrom: number | null;
  floorTo: number | null;
  /** Только свободные квартиры. */
  freeOnly: boolean;
}

export const EMPTY_FILTER: UnitFilter = {
  rooms: [],
  maxPrice: null,
  minArea: null,
  floorFrom: null,
  floorTo: null,
  freeOnly: false,
};

export function isFilterActive(filter: UnitFilter): boolean {
  return (
    filter.rooms.length > 0 ||
    filter.maxPrice !== null ||
    filter.minArea !== null ||
    filter.floorFrom !== null ||
    filter.floorTo !== null ||
    filter.freeOnly
  );
}

export function matchesFilter(unit: ChessUnit, filter: UnitFilter): boolean {
  if (filter.freeOnly && unit.status !== 'FREE') return false;
  if (filter.rooms.length > 0) {
    // «4+» собирает всё, что больше: в фильтре это хранится как 4.
    const max = Math.max(...filter.rooms);
    const hit = filter.rooms.includes(unit.rooms) || (max >= 4 && unit.rooms >= max);
    if (!hit) return false;
  }
  // Цена 0 означает «не указана в фиде» — такую квартиру по цене не отсекаем,
  // иначе риелтор решит, что её нет в продаже.
  if (filter.maxPrice !== null && unit.price > 0 && unit.price > filter.maxPrice) return false;
  if (filter.minArea !== null && unit.area > 0 && unit.area < filter.minArea) return false;
  if (filter.floorFrom !== null && unit.floor < filter.floorFrom) return false;
  if (filter.floorTo !== null && unit.floor > filter.floorTo) return false;
  return true;
}

// =============================================
// РАСКЛАДКА СЕТКИ
// =============================================

export interface FloorRow {
  floor: number;
  /** Ячейки строго по позициям: null — в доме там квартиры нет. */
  cells: (ChessUnit | null)[];
}

export interface GridLayout {
  cols: number;
  rows: FloorRow[];
}

function unitNumber(unit: ChessUnit): number {
  const parsed = parseInt(String(unit.number).replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Раскладывает квартиры по этажам, сохраняя их реальные позиции.
 *
 * Прежняя версия ставила квартиры по порядковому номеру в массиве. Из-за этого
 * дырка в фиде сдвигала весь ряд влево, а любая фильтрация перемешала бы дом.
 * Здесь позиция вычисляется от минимального номера на этаже, поэтому пропущенная
 * квартира оставляет пустое место ровно там, где она должна быть.
 *
 * Если нумерация нестандартная (номера с большими разрывами), эвристика
 * отключается для этого этажа и квартиры раскладываются подряд — но ни одна
 * не теряется: ширина сетки всегда не меньше, чем квартир на самом плотном этаже.
 */
export function buildGridLayout(units: ChessUnit[], minFloors = 0): GridLayout {
  const byFloor = new Map<number, ChessUnit[]>();
  for (const unit of units) {
    const floor = Number.isFinite(unit.floor) ? unit.floor : 0;
    const bucket = byFloor.get(floor);
    if (bucket) bucket.push(unit);
    else byFloor.set(floor, [unit]);
  }
  for (const bucket of byFloor.values()) {
    bucket.sort((a, b) => {
      const na = unitNumber(a);
      const nb = unitNumber(b);
      if (Number.isNaN(na) || Number.isNaN(nb)) return String(a.number).localeCompare(String(b.number));
      return na - nb;
    });
  }

  // Ширина сетки: вмещает и самый плотный этаж, и самый широкий диапазон номеров.
  let cols = 1;
  for (const bucket of byFloor.values()) {
    cols = Math.max(cols, bucket.length);
    const span = numberSpan(bucket);
    // Разрыв больше чем вдвое от числа квартир — это чужая схема нумерации,
    // а не дырки. Растягивать под неё сетку нельзя: получится редкий гребень.
    if (span !== null && span <= bucket.length * 2) cols = Math.max(cols, span);
  }

  const floorNumbers = [...byFloor.keys()].filter(f => f >= 1);
  const maxFloor = Math.max(minFloors, ...(floorNumbers.length ? floorNumbers : [0]));

  const rows: FloorRow[] = [];
  for (let floor = maxFloor; floor >= 1; floor--) {
    rows.push({ floor, cells: placeFloor(byFloor.get(floor) || [], cols) });
  }
  return { cols, rows };
}

function numberSpan(bucket: ChessUnit[]): number | null {
  const numbers = bucket.map(unitNumber).filter(n => !Number.isNaN(n));
  if (numbers.length < 2) return null;
  return Math.max(...numbers) - Math.min(...numbers) + 1;
}

function placeFloor(bucket: ChessUnit[], cols: number): (ChessUnit | null)[] {
  const cells: (ChessUnit | null)[] = new Array(cols).fill(null);
  if (bucket.length === 0) return cells;

  const span = numberSpan(bucket);
  const canUseNumbers = span !== null && span <= cols;

  if (canUseNumbers) {
    const numbers = bucket.map(unitNumber).filter(n => !Number.isNaN(n));
    const min = Math.min(...numbers);
    let placedAll = true;
    for (const unit of bucket) {
      const n = unitNumber(unit);
      const index = Number.isNaN(n) ? -1 : n - min;
      if (index < 0 || index >= cols || cells[index] !== null) { placedAll = false; break; }
      cells[index] = unit;
    }
    if (placedAll) return cells;
    cells.fill(null);
  }

  // Запасной путь: подряд слева направо. Хуже по точности, но ничего не теряет.
  bucket.forEach((unit, index) => { if (index < cols) cells[index] = unit; });
  return cells;
}

// =============================================
// ВСПОМОГАТЕЛЬНОЕ
// =============================================

export function roomLabel(rooms: number): string {
  if (!Number.isFinite(rooms) || rooms <= 0) return 'Студия';
  return `${rooms}-комн`;
}

export function roomShort(rooms: number): string {
  if (!Number.isFinite(rooms) || rooms <= 0) return 'СТ';
  return `${rooms}к`;
}

/** Комнатности, реально встречающиеся в проекте: 4 и выше схлопываются в «4+». */
export function availableRoomOptions(units: ChessUnit[]): number[] {
  const set = new Set<number>();
  for (const unit of units) {
    const rooms = Number.isFinite(unit.rooms) ? Math.max(0, unit.rooms) : 0;
    set.add(rooms >= 4 ? 4 : rooms);
  }
  return [...set].sort((a, b) => a - b);
}

export function formatPriceShort(price: number): string {
  if (!price || price <= 0) return '—';
  const millions = price / 1_000_000;
  return `${millions.toFixed(millions >= 10 ? 0 : 1).replace('.', ',')} млн`;
}
