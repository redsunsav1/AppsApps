import { loadRegistry } from '../src/data/registry';
import { MapGrid } from '../src/sim/map/grid';
import { createSimWorld } from '../src/sim/world';

/** Пустая карта с опциональными стенами из ASCII-строк ('#' — скала). */
export function asciiGrid(rows: string[]): MapGrid {
  const g = new MapGrid(rows[0]!.length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { g.blocked[g.idx(x, y)] = ch === '#' ? 1 : 0; }));
  return g;
}

export function openGrid(w: number, h: number): MapGrid {
  return new MapGrid(w, h);
}

export function makeWorld(grid: MapGrid, seed = 1) {
  return createSimWorld(loadRegistry(), grid, seed);
}
