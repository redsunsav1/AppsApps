import { entityExists } from 'bitecs';
import { describe, expect, it } from 'vitest';
import { toFixed } from '../src/core/fixed';
import { loadRegistry } from '../src/data/registry';
import { Health } from '../src/sim/components';
import { createMatch } from '../src/sim/match';
import { step, worldHash } from '../src/sim/step';
import { enqueue, spawnNode, spawnUnit, type SimWorld } from '../src/sim/world';
import { makeWorld, openGrid } from './helpers';

const run = (w: SimWorld, ticks: number) => { for (let i = 0; i < ticks; i++) step(w); };

describe('бой', () => {
  it('охотник сам находит и топит вражеского разведчика в радиусе обзора', () => {
    const w = makeWorld(openGrid(30, 30));
    const hunter = spawnUnit(w, 'ws_hunter', 0, toFixed(5), toFixed(5));
    const scout = spawnUnit(w, 'ws_scout', 1, toFixed(10), toFixed(5));
    run(w, 20 * 15);
    expect(entityExists(w.ecs, scout) && Health.hp[scout]! > 0 && !w.events.some((e) => e.t === 'death')).toBe(false);
    expect(Health.hp[hunter]).toBeGreaterThan(0);
  });

  it('при обычном движении юнит не отвлекается на врагов', () => {
    const w = makeWorld(openGrid(40, 20));
    const hunter = spawnUnit(w, 'ws_hunter', 0, toFixed(3), toFixed(10));
    spawnUnit(w, 'ws_harvester', 1, toFixed(12), toFixed(12));
    enqueue(w, { type: 'move', player: 0, units: [hunter], x: toFixed(35), y: toFixed(10), mode: 'move', queue: false });
    run(w, 20 * 4);
    expect(w.events.some((e) => e.t === 'shot' && e.owner === 0)).toBe(false);
  });

  it('крейсер бьёт по площади', () => {
    const w = makeWorld(openGrid(30, 30));
    spawnUnit(w, 'ws_cruiser', 0, toFixed(5), toFixed(10));
    const a = spawnUnit(w, 'ws_harvester', 1, toFixed(11), toFixed(10));
    const b = spawnUnit(w, 'ws_harvester', 1, toFixed(11), toFixed(10.9));
    enqueue(w, { type: 'hold', player: 1, units: [a, b] });
    run(w, 20 * 4);
    expect(Health.hp[a]!).toBeLessThan(Health.maxHp[a]!);
    expect(Health.hp[b]!).toBeLessThan(Health.maxHp[b]!);
  });
});

describe('экономика', () => {
  it('сборщик добывает металл и сдаёт на базу', () => {
    const w = makeWorld(openGrid(30, 30));
    spawnUnit(w, 'ws_hq', 0, toFixed(5), toFixed(5));
    spawnUnit(w, 'ws_harvester', 0, toFixed(7), toFixed(5));
    spawnNode(w, toFixed(12), toFixed(8), 500);
    const before = w.players[0]!.metal;
    run(w, 20 * 30);
    expect(w.players[0]!.metal).toBeGreaterThan(before);
    expect(w.events.some((e) => e.t === 'deposit')).toBe(true);
  });

  it('база строит юнит за металл, отмена возвращает деньги', () => {
    const w = makeWorld(openGrid(30, 30));
    const hq = spawnUnit(w, 'ws_hq', 0, toFixed(10), toFixed(10));
    const reg = loadRegistry();
    const scout = reg.unitById.get('ws_scout')!;
    const m0 = w.players[0]!.metal;
    enqueue(w, { type: 'produce', player: 0, building: hq, def: scout.index });
    enqueue(w, { type: 'produce', player: 0, building: hq, def: scout.index });
    step(w);
    expect(w.players[0]!.metal).toBe(m0 - scout.raw.cost * 2);
    enqueue(w, { type: 'cancel', player: 0, building: hq });
    step(w);
    expect(w.players[0]!.metal).toBe(m0 - scout.raw.cost);
    run(w, scout.buildTicks + 2);
    expect(w.events.some((e) => e.t === 'built' && e.def === scout.index)).toBe(true);
  });

  it('нельзя строить без денег', () => {
    const w = makeWorld(openGrid(20, 20));
    const hq = spawnUnit(w, 'ws_hq', 0, toFixed(10), toFixed(10));
    w.players[0]!.metal = 10;
    enqueue(w, { type: 'produce', player: 0, building: hq, def: loadRegistry().unitById.get('ws_cruiser')!.index });
    step(w);
    expect(w.prod.get(hq)!.queue.length).toBe(0);
    expect(w.players[0]!.metal).toBe(10);
  });
});

describe('партия ИИ против ИИ', () => {
  it('доходит до победы одной из сторон и детерминирована', () => {
    const play = () => {
      const { world } = createMatch(loadRegistry(), { seed: 4242, ai: [true, true] });
      for (let t = 0; t < 20 * 60 * 25 && world.winner < 0; t++) step(world);
      return { winner: world.winner, tick: world.tick, hash: worldHash(world) };
    };
    const a = play();
    expect(a.winner).toBeGreaterThanOrEqual(0);
    expect(play()).toEqual(a);
  }, 120_000);
});
