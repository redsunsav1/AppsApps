// Fixed-point: 1 тайл = ONE единиц. Вся симуляция в целых числах ради детерминизма.
export const SHIFT = 10;
export const ONE = 1 << SHIFT;
export const HALF = ONE >> 1;

/** Угол хранится как u16: 65536 = полный оборот. */
export const ANGLE_FULL = 65536;
export const ANGLE_HALF = 32768;
export const ANGLE_QUARTER = 16384;

export const toFixed = (tiles: number): number => Math.round(tiles * ONE);
export const fromFixed = (v: number): number => v / ONE;
export const tileOf = (v: number): number => v >> SHIFT;
export const tileCenter = (tile: number): number => (tile << SHIFT) + HALF;

/** Умножение двух fixed-чисел. */
export const fmul = (a: number, b: number): number => Math.trunc((a * b) / ONE);

/** Целый квадратный корень (Math.sqrt корректно округляется по IEEE, поэтому детерминирован). */
export const isqrt = (n: number): number => (n <= 0 ? 0 : Math.floor(Math.sqrt(n)));

export const dist2 = (dx: number, dy: number): number => dx * dx + dy * dy;
export const length = (dx: number, dy: number): number => isqrt(dx * dx + dy * dy);

// Таблица косинусов на 1024 шага. Значения в fixed (ONE = 1.0).
const TRIG_BITS = 10;
const TRIG_SIZE = 1 << TRIG_BITS;
const COS_TABLE = new Int32Array(TRIG_SIZE);
for (let i = 0; i < TRIG_SIZE; i++) COS_TABLE[i] = Math.round(Math.cos((i / TRIG_SIZE) * Math.PI * 2) * ONE);

export const fcos = (angle: number): number => COS_TABLE[((angle & 0xffff) >> (16 - TRIG_BITS)) & (TRIG_SIZE - 1)]!;
export const fsin = (angle: number): number => fcos(angle - ANGLE_QUARTER);

/**
 * Целочисленный atan2 → u16-угол. Аппроксимация atan(r) ≈ π/4·r + 0.273·r·(1−r),
 * ошибка < 0.3°, для поворота спрайтов и юнитов достаточно.
 */
export function fatan2(y: number, x: number): number {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const swap = ay > ax;
  const r = swap ? Math.trunc((ax * ONE) / ay) : Math.trunc((ay * ONE) / ax); // 0..ONE
  let a = Math.trunc((8192 * r + Math.trunc((2847 * r * (ONE - r)) / ONE)) / ONE); // 0..8192
  if (swap) a = ANGLE_QUARTER - a;
  if (x < 0) a = ANGLE_HALF - a;
  if (y < 0) a = ANGLE_FULL - a;
  return a & 0xffff;
}

/** Разница углов в диапазоне [-32768, 32767]. */
export const angleDiff = (from: number, to: number): number => ((((to - from) & 0xffff) + ANGLE_HALF) & 0xffff) - ANGLE_HALF;

/** Перевод «градусы в секунду» в u16-единицы за тик. */
export const degPerSecToTick = (deg: number, tickRate: number): number => Math.round((deg / 360) * ANGLE_FULL / tickRate);

/** Перевод «тайлы в секунду» в fixed за тик. */
export const tilesPerSecToTick = (tiles: number, tickRate: number): number => Math.round((tiles * ONE) / tickRate);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
