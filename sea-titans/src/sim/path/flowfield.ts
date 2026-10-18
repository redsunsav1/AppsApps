import { COST8, DX8, DY8, type MapGrid } from '../map/grid';

export const NO_DIR = -1;
const INF = 0x7fffffff;
const BUCKETS = 15; // > максимальной стоимости шага (14)

/** Поле потока к одной клетке-цели: стоимость до цели и лучшее направление из каждой клетки. */
export class FlowField {
  readonly cost: Int32Array;
  readonly dir: Int8Array;
  lastUsedTick = 0;

  constructor(readonly goal: number, grid: MapGrid, readonly cls = 0) {
    const w = grid.width, h = grid.h;
    const n = w * h;
    this.cost = new Int32Array(n).fill(INF);
    this.dir = new Int8Array(n).fill(NO_DIR);
    const b = grid.blockedFor(cls);
    if (b[goal]) return;

    // Дейкстра от цели с корзинами (алгоритм Дайала): стоимости шагов 10/14, поэтому O(n).
    // Шаги симметричны, обратный проход от цели корректен.
    const cost = this.cost;
    const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
    cost[goal] = 0;
    buckets[0]!.push(goal);
    let pending = 1;
    for (let cur = 0; pending > 0; cur++) {
      const bucket = buckets[cur % BUCKETS]!;
      while (bucket.length > 0) {
        const c = bucket.pop()!;
        pending--;
        if (cost[c] !== cur) continue; // устаревшая запись
        const cx = c % w, cy = (c / w) | 0;
        for (let d = 0; d < 8; d++) {
          const nx = cx + DX8[d]!, ny = cy + DY8[d]!;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (b[ni] || (d >= 4 && (b[cy * w + nx] || b[ny * w + cx]))) continue;
          const nc = cur + COST8[d]!;
          if (nc < cost[ni]!) { cost[ni] = nc; buckets[nc % BUCKETS]!.push(ni); pending++; }
        }
      }
    }

    for (let c = 0; c < n; c++) {
      if (cost[c] === INF || c === goal) continue;
      const cx = c % w, cy = (c / w) | 0;
      let best = cost[c]!;
      let bestD = NO_DIR;
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX8[d]!, ny = cy + DY8[d]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (b[ni] || (d >= 4 && (b[cy * w + nx] || b[ny * w + cx]))) continue;
        if (cost[ni]! < best) { best = cost[ni]!; bestD = d; }
      }
      this.dir[c] = bestD;
    }
  }

  reachable(cell: number): boolean {
    return this.cost[cell] !== INF;
  }
}

/** LRU-кэш полей. На результат симуляции не влияет, только на скорость. */
export class FlowFieldCache {
  private readonly fields = new Map<number, FlowField>();
  private budgetTick = -1;
  private builtThisTick = 0;

  constructor(private readonly grid: MapGrid, private readonly capacity = 24) {}

  get(goal: number, tick: number, cls = 0): FlowField {
    const key = cls * this.grid.width * this.grid.h + goal;
    let f = this.fields.get(key);
    if (!f) {
      if (this.fields.size >= this.capacity) this.evict();
      f = new FlowField(goal, this.grid, cls);
      this.fields.set(key, f);
    }
    f.lastUsedTick = tick;
    return f;
  }

  /**
   * Поле, если уже есть или укладывается в бюджет построений на этот тик; иначе null
   * (юнит подождёт тик). Бюджет детерминирован, поэтому симуляция остаётся воспроизводимой.
   */
  tryGet(goal: number, tick: number, cls: number, budget: number): FlowField | null {
    const key = cls * this.grid.width * this.grid.h + goal;
    const f = this.fields.get(key);
    if (f) { f.lastUsedTick = tick; return f; }
    if (tick !== this.budgetTick) { this.budgetTick = tick; this.builtThisTick = 0; }
    if (this.builtThisTick >= budget) return null;
    this.builtThisTick++;
    return this.get(goal, tick, cls);
  }

  invalidate(): void {
    this.fields.clear();
  }

  private evict(): void {
    let oldest: number | null = null;
    let oldestTick = Infinity;
    for (const [k, f] of this.fields) if (f.lastUsedTick < oldestTick) { oldestTick = f.lastUsedTick; oldest = k; }
    if (oldest !== null) this.fields.delete(oldest);
  }
}
