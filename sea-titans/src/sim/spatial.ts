import { SHIFT } from '../core/fixed';

/** Равномерная сетка для поиска соседей. Перестраивается раз в тик сортировкой подсчётом. */
export class SpatialHash {
  readonly cellShift: number;
  readonly cols: number;
  readonly rows: number;
  private start: Int32Array;
  private items = new Int32Array(1024);
  private cellOf = new Int32Array(1024);
  count = 0;

  constructor(mapW: number, mapH: number, cellTilesLog2 = 1) {
    this.cellShift = SHIFT + cellTilesLog2;
    this.cols = (mapW >> cellTilesLog2) + 1;
    this.rows = (mapH >> cellTilesLog2) + 1;
    this.start = new Int32Array(this.cols * this.rows + 1);
  }

  rebuild(eids: ArrayLike<number>, xs: Int32Array, ys: Int32Array): void {
    const n = eids.length;
    if (this.items.length < n) {
      this.items = new Int32Array(n * 2);
      this.cellOf = new Int32Array(n * 2);
    }
    const start = this.start;
    start.fill(0);
    for (let i = 0; i < n; i++) {
      const e = eids[i]!;
      const c = this.cell(xs[e]!, ys[e]!);
      this.cellOf[i] = c;
      start[c + 1]!++;
    }
    for (let c = 1; c < start.length; c++) start[c]! += start[c - 1]!;
    const fill = start.slice(0, start.length - 1);
    for (let i = 0; i < n; i++) this.items[fill[this.cellOf[i]!]!++] = eids[i]!;
    this.count = n;
  }

  cell(x: number, y: number): number {
    const cx = Math.max(0, Math.min(this.cols - 1, x >> this.cellShift));
    const cy = Math.max(0, Math.min(this.rows - 1, y >> this.cellShift));
    return cy * this.cols + cx;
  }

  /** Вызывает fn для всех сущностей в клетках, пересекающих квадрат вокруг точки. */
  query(x: number, y: number, radius: number, fn: (eid: number) => void): void {
    const x0 = Math.max(0, (x - radius) >> this.cellShift);
    const x1 = Math.min(this.cols - 1, (x + radius) >> this.cellShift);
    const y0 = Math.max(0, (y - radius) >> this.cellShift);
    const y1 = Math.min(this.rows - 1, (y + radius) >> this.cellShift);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cy * this.cols + cx;
        for (let k = this.start[c]!; k < this.start[c + 1]!; k++) fn(this.items[k]!);
      }
    }
  }
}
