import { describe, expect, it } from 'vitest';
import { toFixed, length } from '../src/core/fixed';
import { Mover, Position } from '../src/sim/components';
import { generateTestMap } from '../src/sim/map/testmap';
import { step, worldHash } from '../src/sim/step';
import { enqueue, spawnUnit, type SimWorld } from '../src/sim/world';
import { asciiGrid, makeWorld, openGrid } from './helpers';

function spawnBlock(w: SimWorld, n: number, x0: number, y0: number, kinds = ['ws_hunter']): number[] {
  const out: number[] = [];
  const cols = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    out.push(spawnUnit(w, kinds[i % kinds.length]!, 0, toFixed(x0 + (i % cols) * 1.6), toFixed(y0 + Math.floor(i / cols) * 1.6)));
  }
  return out;
}

const run = (w: SimWorld, ticks: number) => { for (let i = 0; i < ticks; i++) step(w); };

describe('движение', () => {
  it('одиночный юнит доезжает до цели на открытой карте', () => {
    const w = makeWorld(openGrid(40, 40));
    const [e] = spawnBlock(w, 1, 5, 5);
    enqueue(w, { type: 'move', player: 0, units: [e!], x: toFixed(30), y: toFixed(25), mode: 'move', queue: false });
    run(w, 400);
    expect(length(Position.x[e!]! - toFixed(30), Position.y[e!]! - toFixed(25))).toBeLessThan(toFixed(0.3));
    expect(w.orders.get(e!)!.length).toBe(0);
  });

  it('объезжает стену (A*)', () => {
    const rows = Array.from({ length: 30 }, (_, y) => Array.from({ length: 30 }, (_, x) => (x === 15 && y < 25 ? '#' : '.')).join(''));
    const w = makeWorld(asciiGrid(rows));
    const [e] = spawnBlock(w, 1, 5, 5);
    enqueue(w, { type: 'move', player: 0, units: [e!], x: toFixed(25), y: toFixed(5), mode: 'move', queue: false });
    run(w, 900);
    expect(length(Position.x[e!]! - toFixed(25), Position.y[e!]! - toFixed(5))).toBeLessThan(toFixed(0.5));
  });

  it('группа из 20 доезжает через flow field и не слипается', () => {
    const { grid, spawns } = generateTestMap(128, 128, 1337);
    const w = makeWorld(grid);
    const units = spawnBlock(w, 20, spawns[0]!.x - 3, spawns[0]!.y - 3, ['ws_hunter', 'ws_scout', 'ws_cruiser']);
    const tx = spawns[1]!.x, ty = spawns[1]!.y;
    enqueue(w, { type: 'move', player: 0, units, x: toFixed(tx), y: toFixed(ty), mode: 'move', queue: false });
    run(w, 20 * 120);
    for (const e of units) {
      expect(length(Position.x[e]! - toFixed(tx), Position.y[e]! - toFixed(ty))).toBeLessThan(toFixed(9));
      expect(grid.isBlocked(Position.x[e]! >> 10, Position.y[e]! >> 10)).toBe(false);
    }
    for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) {
      const a = units[i]!, b = units[j]!;
      const d = length(Position.x[a]! - Position.x[b]!, Position.y[a]! - Position.y[b]!);
      expect(d).toBeGreaterThan(Math.trunc((Mover.radius[a]! + Mover.radius[b]!) * 0.8));
    }
  });

  it('Shift-очередь выполняется по порядку, стоп очищает', () => {
    const w = makeWorld(openGrid(40, 40));
    const [e] = spawnBlock(w, 1, 5, 5);
    enqueue(w, { type: 'move', player: 0, units: [e!], x: toFixed(10), y: toFixed(5), mode: 'move', queue: false });
    enqueue(w, { type: 'move', player: 0, units: [e!], x: toFixed(10), y: toFixed(15), mode: 'move', queue: true });
    step(w);
    expect(w.orders.get(e!)!.length).toBe(2);
    run(w, 600);
    expect(length(Position.x[e!]! - toFixed(10), Position.y[e!]! - toFixed(15))).toBeLessThan(toFixed(0.3));
    enqueue(w, { type: 'move', player: 0, units: [e!], x: toFixed(30), y: toFixed(30), mode: 'move', queue: false });
    run(w, 5);
    enqueue(w, { type: 'stop', player: 0, units: [e!] });
    step(w);
    expect(w.orders.get(e!)!.length).toBe(0);
  });

  it('чужие юниты не принимают приказы', () => {
    const w = makeWorld(openGrid(20, 20));
    const e = spawnUnit(w, 'ws_hunter', 1, toFixed(5), toFixed(5));
    enqueue(w, { type: 'move', player: 0, units: [e], x: toFixed(15), y: toFixed(15), mode: 'move', queue: false });
    step(w);
    expect(w.orders.get(e)!.length).toBe(0);
  });
});

describe('детерминизм', () => {
  it('одинаковые команды → одинаковый хэш мира через 1000 тиков', () => {
    const play = () => {
      const { grid, spawns } = generateTestMap(96, 96, 77);
      const w = makeWorld(grid, 77);
      const a = spawnBlock(w, 25, spawns[0]!.x - 4, spawns[0]!.y - 4, ['ws_hunter', 'ws_scout', 'ws_cruiser']);
      const b = spawnBlock(w, 4, spawns[0]!.x + 4, spawns[0]!.y - 6);
      for (let t = 0; t < 1000; t++) {
        if (t === 0) enqueue(w, { type: 'move', player: 0, units: a, x: toFixed(spawns[1]!.x), y: toFixed(spawns[1]!.y), mode: 'move', queue: false });
        if (t === 10) enqueue(w, { type: 'move', player: 0, units: b, x: toFixed(48), y: toFixed(20), mode: 'patrol', queue: false });
        if (t === 400) enqueue(w, { type: 'move', player: 0, units: a.slice(0, 8), x: toFixed(20), y: toFixed(80), mode: 'move', queue: true });
        step(w);
      }
      return worldHash(w);
    };
    expect(play()).toBe(play());
  });
});
