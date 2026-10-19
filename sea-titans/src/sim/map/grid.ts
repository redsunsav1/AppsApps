import { HALF, SHIFT } from '../../core/fixed';
import type { BiomeId } from '../../data/schema';

export const BIOMES: readonly BiomeId[] = ['sand', 'silt', 'coral', 'rock', 'volcanic', 'abyss'];
export const BIOME_INDEX: Record<BiomeId, number> = { sand: 0, silt: 1, coral: 2, rock: 3, volcanic: 4, abyss: 5 };

/** Логическая карта: проходимость влияет на симуляцию, биом и высота только визуальные. */
export class MapGrid {
  readonly blocked: Uint8Array;
  readonly biome: Uint8Array;
  /** Визуальная высота рельефа в «уровнях» (0 — дно, >0 — скалы). Логику не трогает. */
  readonly height: Float32Array;

  constructor(readonly width: number, readonly height_: number) {
    const n = width * height_;
    this.blocked = new Uint8Array(n);
    this.biome = new Uint8Array(n);
    this.height = new Float32Array(n);
  }

  get h(): number {
    return this.height_;
  }

  idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height_;
  }

  isBlocked(x: number, y: number, cls = 0): boolean {
    return !this.inBounds(x, y) || this.blockedFor(cls)[y * this.width + x] === 1;
  }

  private classMaps: Uint8Array[] = [];

  /**
   * Проходимость для класса размера k: клетка (x, y) свободна, если свободен квадрат
   * (k+1)×(k+1) с левым верхним углом в ней. Юнит класса k стоит в центре такого квадрата,
   * поэтому соседние свободные клетки гарантируют коридор шириной k+1. Класс 0 — сама blocked.
   */
  blockedFor(cls: number): Uint8Array {
    if (cls === 0) return this.blocked;
    let m = this.classMaps[cls];
    if (m) return m;
    const w = this.width, h = this.height_, s = cls + 1;
    // префиксные суммы занятости
    const sum = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      sum[(y + 1) * (w + 1) + x + 1] = this.blocked[y * w + x]! + sum[y * (w + 1) + x + 1]! + sum[(y + 1) * (w + 1) + x]! - sum[y * (w + 1) + x]!;
    }
    const freeSquare = (x0: number, y0: number) => {
      if (x0 < 0 || y0 < 0 || x0 + s > w || y0 + s > h) return false;
      const a = sum[y0 * (w + 1) + x0]!, b = sum[y0 * (w + 1) + x0 + s]!, c = sum[(y0 + s) * (w + 1) + x0]!, d = sum[(y0 + s) * (w + 1) + x0 + s]!;
      return d - b - c + a === 0;
    };
    m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = freeSquare(x, y) ? 0 : 1;
    this.classMaps[cls] = m;
    return m;
  }

  /** Сбросить кэш классов после изменения blocked (генератор, разрушение рельефа). */
  invalidateClasses(): void {
    this.classMaps = [];
  }

  /** Ближайшая проходимая клетка (BFS). Возвращает индекс или -1. */
  nearestPassable(x: number, y: number, maxRadius = 32, cls = 0): number {
    const w = this.width;
    x = Math.max(0, Math.min(w - 1, x));
    y = Math.max(0, Math.min(this.height_ - 1, y));
    if (!this.isBlocked(x, y, cls)) return this.idx(x, y);
    const seen = new Uint8Array(w * this.height_);
    const queue: number[] = [this.idx(x, y)];
    seen[queue[0]!] = 1;
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head]!;
      const cx = c % w;
      const cy = (c / w) | 0;
      if (Math.abs(cx - x) > maxRadius || Math.abs(cy - y) > maxRadius) continue;
      if (!this.isBlocked(cx, cy, cls)) return c;
      for (let d = 0; d < 4; d++) {
        const nx = cx + DX4[d]!;
        const ny = cy + DY4[d]!;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (seen[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    return -1;
  }

  /** Связная компонента проходимых клеток от (x, y), 8-связность без срезания углов. */
  floodFill(x: number, y: number, cls = 0): Uint8Array {
    const w = this.width, h = this.height_;
    const out = new Uint8Array(w * h);
    if (this.isBlocked(x, y, cls)) return out;
    const b = this.blockedFor(cls);
    const queue = new Int32Array(w * h);
    let tail = 0;
    queue[tail++] = y * w + x;
    out[y * w + x] = 1;
    for (let head = 0; head < tail; head++) {
      const c = queue[head]!;
      const cx = c % w, cy = (c / w) | 0;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX8[d]!, ny = cy + DY8[d]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (out[ni] || b[ni] || (d >= 4 && (b[cy * w + nx] || b[ny * w + cx]))) continue;
        out[ni] = 1;
        queue[tail++] = ni;
      }
    }
    return out;
  }

  /** Можно ли шагнуть из клетки в направлении d (диагонали — только если оба боковых свободны). */
  canStep(x: number, y: number, d: number, cls = 0): boolean {
    const nx = x + DX8[d]!;
    const ny = y + DY8[d]!;
    if (this.isBlocked(nx, ny, cls)) return false;
    if (d >= 4) return !this.isBlocked(nx, y, cls) && !this.isBlocked(x, ny, cls);
    return true;
  }
}

export const DX4 = [1, -1, 0, 0] as const;
export const DY4 = [0, 0, 1, -1] as const;
// 0..3 — ортогональные, 4..7 — диагонали
export const DX8 = [1, -1, 0, 0, 1, 1, -1, -1] as const;
export const DY8 = [0, 0, 1, -1, 1, -1, 1, -1] as const;
export const COST8 = [10, 10, 10, 10, 14, 14, 14, 14] as const;

/** Класс размера по радиусу в тайлах: 0 — до 0.5, 1 — до 1.0, 2 — до 1.5 … */
export const sizeClassOf = (radiusTiles: number): number => Math.max(0, Math.ceil(radiusTiles * 2 - 1e-9) - 1);

/** Клетка сетки класса cls, в которой стоит центр юнита (fixed-координата → индекс по оси). */
export const cellCoord = (v: number, cls: number): number => (v - cls * HALF) >> SHIFT;
/** Центр клетки класса cls в fixed-координатах. */
export const cellCenter = (c: number, cls: number): number => (c << SHIFT) + ((cls + 1) << (SHIFT - 1));
