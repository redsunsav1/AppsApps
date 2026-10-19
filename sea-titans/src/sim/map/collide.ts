import { ONE, SHIFT } from '../../core/fixed';
import type { MapGrid } from './grid';

/** Выталкивает круг (x, y, r) из заблокированных клеток и за границы карты. Возвращает [x, y]. */
export function resolveTerrain(grid: MapGrid, x: number, y: number, r: number): [number, number] {
  const maxX = grid.width * ONE - r - 1;
  const maxY = grid.h * ONE - r - 1;
  for (let iter = 0; iter < 2; iter++) {
    x = Math.max(r, Math.min(maxX, x));
    y = Math.max(r, Math.min(maxY, y));
    const tx0 = (x - r) >> SHIFT, tx1 = (x + r) >> SHIFT;
    const ty0 = (y - r) >> SHIFT, ty1 = (y + r) >> SHIFT;
    let moved = false;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (!grid.isBlocked(tx, ty)) continue;
        const left = tx << SHIFT, top = ty << SHIFT;
        const right = left + ONE, bottom = top + ONE;
        const cx = x < left ? left : x > right ? right : x;
        const cy = y < top ? top : y > bottom ? bottom : y;
        const dx = x - cx, dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 === 0) {
          // центр внутри клетки: к ближайшему краю
          const dl = x - left, dr = right - x, dt = y - top, db = bottom - y;
          const m = Math.min(dl, dr, dt, db);
          if (m === dl) x = left - r; else if (m === dr) x = right + r; else if (m === dt) y = top - r; else y = bottom + r;
        } else {
          const d = Math.floor(Math.sqrt(d2));
          const push = r - d + 1;
          x += Math.trunc((dx * push) / d);
          y += Math.trunc((dy * push) / d);
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [x, y];
}
