import { SHIFT } from '../../core/fixed';
import type { MapGrid } from '../map/grid';

const STEP = 256; // четверть тайла

/** Свободна ли прямая между двумя точками (fixed-координаты). */
export function lineClear(grid: MapGrid, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / STEP));
  for (let k = 0; k <= steps; k++) {
    const x = ax + Math.trunc((dx * k) / steps);
    const y = ay + Math.trunc((dy * k) / steps);
    if (grid.isBlocked(x >> SHIFT, y >> SHIFT)) return false;
  }
  return true;
}

/** То же, но «толстая» линия: проверяем ещё две параллельные на расстоянии radius. */
export function lineClearThick(grid: MapGrid, ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  if (!lineClear(grid, ax, ay, bx, by)) return false;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.floor(Math.sqrt(dx * dx + dy * dy));
  if (len === 0 || radius === 0) return true;
  const ox = Math.trunc((-dy * radius) / len);
  const oy = Math.trunc((dx * radius) / len);
  return lineClear(grid, ax + ox, ay + oy, bx + ox, by + oy) && lineClear(grid, ax - ox, ay - oy, bx - ox, by - oy);
}
