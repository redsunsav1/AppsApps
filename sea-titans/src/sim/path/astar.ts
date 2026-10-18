import { COST8, DX8, DY8, cellCenter, type MapGrid } from '../map/grid';
import { MinHeap } from './heap';
import { lineClearThick } from './los';

/** A* по 8 направлениям с переиспользуемыми буферами (stamp вместо очистки). */
export class AStar {
  private readonly g: Int32Array;
  private readonly from: Int32Array;
  private readonly stamp: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private readonly heap = new MinHeap();

  constructor(private readonly grid: MapGrid, private readonly maxNodes: number) {
    const n = grid.width * grid.h;
    this.g = new Int32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Путь в индексах клеток от start до goal включительно, или null. */
  find(start: number, goal: number, cls = 0): number[] | null {
    const grid = this.grid;
    const w = grid.width;
    const blocked = grid.blockedFor(cls);
    if (blocked[start] || blocked[goal]) return null;
    if (start === goal) return [goal];
    const gen = ++this.gen;
    const gx = goal % w;
    const gy = (goal / w) | 0;
    const heap = this.heap;
    heap.clear();
    this.stamp[start] = gen;
    this.g[start] = 0;
    this.from[start] = -1;
    heap.push(octile(start % w, (start / w) | 0, gx, gy), 0, start);
    let expanded = 0;
    while (heap.size > 0) {
      const c = heap.pop();
      if (this.closed[c] === gen) continue;
      this.closed[c] = gen;
      if (c === goal) return this.reconstruct(goal);
      if (++expanded > this.maxNodes) return null;
      const cx = c % w;
      const cy = (c / w) | 0;
      const gc = this.g[c]!;
      for (let d = 0; d < 8; d++) {
        if (!grid.canStep(cx, cy, d, cls)) continue;
        const nx = cx + DX8[d]!;
        const ny = cy + DY8[d]!;
        const ni = ny * w + nx;
        if (this.closed[ni] === gen) continue;
        const ng = gc + COST8[d]!;
        if (this.stamp[ni] === gen && this.g[ni]! <= ng) continue;
        this.stamp[ni] = gen;
        this.g[ni] = ng;
        this.from[ni] = c;
        const h = octile(nx, ny, gx, gy);
        heap.push(ng + h, h, ni);
      }
    }
    return null;
  }

  private reconstruct(goal: number): number[] {
    const path: number[] = [];
    for (let c = goal; c !== -1; c = this.from[c]!) path.push(c);
    return path.reverse();
  }
}

export function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx > dy ? 10 * dx + 4 * dy : 10 * dy + 4 * dx;
}

/**
 * Сглаживание пути «натягиванием нити»: убираем промежуточные точки,
 * если между соседями есть толстая прямая видимость. Возвращает fixed-точки [x0,y0,x1,y1,…].
 */
export function smoothPath(grid: MapGrid, cells: number[], fromX: number, fromY: number, radius: number, cls = 0): number[] {
  const w = grid.width;
  const pts: number[] = [];
  let ax = fromX;
  let ay = fromY;
  let i = 0;
  while (i < cells.length) {
    // ищем самую дальнюю видимую клетку
    let j = cells.length - 1;
    for (; j > i; j--) {
      const c = cells[j]!;
      if (lineClearThick(grid, ax, ay, cellCenter(c % w, cls), cellCenter((c / w) | 0, cls), radius)) break;
    }
    const c = cells[j]!;
    ax = cellCenter(c % w, cls);
    ay = cellCenter((c / w) | 0, cls);
    pts.push(ax, ay);
    i = j + 1;
  }
  return pts;
}
