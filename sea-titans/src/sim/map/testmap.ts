import { Rng } from '../../core/rng';
import { BIOME_INDEX, DX4, DY4, MapGrid } from './grid';

/**
 * Тестовая карта этапа 1: хребты с проходами, впадины, коралловые пятна.
 * Полноценный генератор с 10 шаблонами будет на этапе 4 (src/mapgen).
 */
export interface TestMap {
  grid: MapGrid;
  spawns: { x: number; y: number }[];
}

export function generateTestMap(width: number, height: number, seed: number): TestMap {
  const rng = new Rng(seed);
  const grid = new MapGrid(width, height);
  const depth = new ValueNoise(rng, 32);
  const ridge = new ValueNoise(rng, 32);
  const coral = new ValueNoise(rng, 32);
  const volc = new ValueNoise(rng, 32);
  const gaps = new ValueNoise(rng, 32); // разрывы в хребтах = проходы

  const spawns = [
    { x: Math.round(width * 0.18), y: Math.round(height * 0.5) },
    { x: Math.round(width * 0.82), y: Math.round(height * 0.5) },
  ];
  const clearR = Math.max(8, Math.round(width * 0.08));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = grid.idx(x, y);
      const d = depth.fbm(x / 34, y / 34, 4);
      const rn = ridge.fbm(x / 22, y / 22, 3);
      const r = 1 - Math.abs(2 * rn - 1); // гребни шума → хребты
      const c = coral.fbm(x / 10, y / 10, 2);
      const v = volc.fbm(x / 18, y / 18, 2);
      const g = gaps.fbm(x / 9, y / 9, 2);

      let nearSpawn = false;
      for (const s of spawns) if ((x - s.x) ** 2 + (y - s.y) ** 2 < clearR * clearR) nearSpawn = true;

      let biome = d < 0.3 ? BIOME_INDEX.abyss : d < 0.45 ? BIOME_INDEX.silt : BIOME_INDEX.sand;
      if (c > 0.68 && biome !== BIOME_INDEX.abyss) biome = BIOME_INDEX.coral;
      if (v > 0.74) biome = BIOME_INDEX.volcanic;

      const isRidge = r > 0.88 && g > 0.36 && !nearSpawn;
      if (isRidge) {
        grid.blocked[i] = 1;
        biome = BIOME_INDEX.rock;
        grid.height[i] = 1.2 + (r - 0.88) * 20;
      } else {
        grid.height[i] = (d - 0.45) * 1.4;
      }
      grid.biome[i] = biome;
    }
  }

  // Изолированные карманы заливаем скалой, чтобы все клетки были достижимы.
  ensureConnected(grid, spawns);
  return { grid, spawns };
}

/**
 * Связность для всех классов размера: сначала для крупных (cls 1, коридоры ≥ 2 клеток),
 * затем для мелких. Большие отрезанные области соединяются коридором, мелкие карманы заливаются скалой.
 */
function ensureConnected(grid: MapGrid, spawns: { x: number; y: number }[]): void {
  for (const cls of [1, 0]) connectClass(grid, spawns, cls);
}

function connectClass(grid: MapGrid, spawns: { x: number; y: number }[], cls: number): void {
  const s0 = spawns[0]!;
  const n = grid.width * grid.h;
  const skip = new Uint8Array(n);
  for (let guard = 0; guard < 96; guard++) {
    const blocked = grid.blockedFor(cls);
    const reach = grid.floodFill(s0.x, s0.y, cls);
    let u = -1;
    for (const s of spawns) if (!reach[grid.idx(s.x, s.y)]) { u = grid.idx(s.x, s.y); break; }
    if (u < 0) for (let i = 0; i < n; i++) if (!blocked[i] && !reach[i] && !skip[i]) { u = i; break; }
    if (u < 0) return;
    const comp = grid.floodFill(u % grid.width, (u / grid.width) | 0, cls);
    let size = 0;
    for (let i = 0; i < n; i++) size += comp[i]!;
    if (size < 24) {
      if (cls === 0) { for (let i = 0; i < n; i++) if (comp[i]) sealRock(grid, i); grid.invalidateClasses(); }
      else for (let i = 0; i < n; i++) if (comp[i]) skip[i] = 1; // крупным туда просто нельзя
      continue;
    }
    carveToReach(grid, comp, reach, cls + 2);
    grid.invalidateClasses();
  }
}

function sealRock(grid: MapGrid, i: number): void {
  grid.blocked[i] = 1;
  grid.biome[i] = BIOME_INDEX.rock;
  grid.height[i] = Math.max(grid.height[i]!, 1.2);
}

/** Кратчайший (по клеткам) коридор шириной `width` от компоненты до достижимой области. */
function carveToReach(grid: MapGrid, comp: Uint8Array, reach: Uint8Array, width: number): void {
  const w = grid.width;
  const n = w * grid.h;
  const prev = new Int32Array(n).fill(-2);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (comp[i]) { prev[i] = -1; queue.push(i); }
  let hit = -1;
  for (let head = 0; head < queue.length && hit < 0; head++) {
    const c = queue[head]!;
    const cx = c % w, cy = (c / w) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX4[d]!, ny = cy + DY4[d]!;
      if (!grid.inBounds(nx, ny)) continue;
      const ni = grid.idx(nx, ny);
      if (prev[ni] !== -2) continue;
      prev[ni] = c;
      if (reach[ni]) { hit = ni; break; }
      queue.push(ni);
    }
  }
  for (let c = hit; c >= 0; c = prev[c]!) {
    const cx = c % w, cy = (c / w) | 0;
    for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) {
      if (!grid.inBounds(cx + ox, cy + oy)) continue;
      const i = grid.idx(cx + ox, cy + oy);
      if (grid.blocked[i]) { grid.blocked[i] = 0; grid.biome[i] = BIOME_INDEX.silt; grid.height[i] = 0; }
    }
  }
}

/** Value noise на решётке с периодом `period`, значения 0..1. */
class ValueNoise {
  private readonly lattice: Float32Array;

  constructor(rng: Rng, private readonly period: number) {
    this.lattice = new Float32Array(period * period);
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng.float();
  }

  private at(x: number, y: number): number {
    const p = this.period;
    return this.lattice[(((y % p) + p) % p) * p + (((x % p) + p) % p)]!;
  }

  sample(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.at(x0, y0) + (this.at(x0 + 1, y0) - this.at(x0, y0)) * sx;
    const b = this.at(x0, y0 + 1) + (this.at(x0 + 1, y0 + 1) - this.at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  }

  fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0; o < octaves; o++) {
      sum += this.sample(x * f + o * 17.3, y * f + o * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
