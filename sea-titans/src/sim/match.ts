import { toFixed, tileCenter } from '../core/fixed';
import type { Registry } from '../data/registry';
import { generateTestMap } from './map/testmap';
import { createSimWorld, spawnNode, spawnUnit, type SimWorld } from './world';

export interface MatchOptions {
  seed: number;
  /** Какие игроки под управлением ИИ. Игрок 0 — человек, если не указано иное. */
  ai: boolean[];
}

/** Партия 1×1: база, два сборщика и три охотника у каждого, месторождения по карте. */
export function createMatch(reg: Registry, opts: MatchOptions): { world: SimWorld; spawns: { x: number; y: number }[] } {
  const { width, height } = reg.game.map;
  const { grid, spawns, deposits } = generateTestMap(width, height, opts.seed);
  const w = createSimWorld(reg, grid, opts.seed, spawns.length);
  spawns.forEach((s, p) => {
    w.players[p]!.ai = opts.ai[p] ?? p !== 0;
    const face = s.x < width / 2 ? 0 : 32768;
    const dir = s.x < width / 2 ? 1 : -1;
    const hq = spawnUnit(w, 'ws_hq', p, tileCenter(s.x), tileCenter(s.y));
    const prod = w.prod.get(hq)!;
    prod.rallyX = toFixed(s.x + dir * 3.5);
    prod.rallyY = toFixed(s.y + 0.5);
    spawnUnit(w, 'ws_harvester', p, toFixed(s.x + dir * 2), toFixed(s.y - 2), face);
    spawnUnit(w, 'ws_harvester', p, toFixed(s.x + dir * 2), toFixed(s.y + 2.5), face);
    for (let k = 0; k < 3; k++) spawnUnit(w, 'ws_hunter', p, toFixed(s.x + dir * 3.5), toFixed(s.y - 1.2 + k * 1.2), face);
  });
  for (const d of deposits) spawnNode(w, tileCenter(d.x), tileCenter(d.y), reg.game.economy.depositAmount);
  return { world: w, spawns };
}
