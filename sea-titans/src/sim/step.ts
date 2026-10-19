import { aiSystem } from '../ai/simpleAi';
import { Facing, Health, Position, Unit } from './components';
import { applyCommands } from './commands';
import { combatSystem, projectileSystem } from './systems/combat';
import { deathSystem, harvestSystem, productionSystem } from './systems/economy';
import { movementSystem } from './systems/movement';
import { navigationSystem } from './systems/navigation';
import { separationSystem } from './systems/separation';
import { unitQuery, type SimWorld } from './world';

/** Один тик симуляции. Порядок систем фиксирован. */
export function step(w: SimWorld): void {
  const ents = unitQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    Position.px[e] = Position.x[e]!;
    Position.py[e] = Position.y[e]!;
    Facing.prev[e] = Facing.angle[e]!;
  }
  aiSystem(w);
  applyCommands(w);
  harvestSystem(w);
  productionSystem(w);
  navigationSystem(w);
  combatSystem(w);
  movementSystem(w);
  separationSystem(w);
  projectileSystem(w);
  deathSystem(w);
  w.tick++;
}

/** FNV-1a хэш состояния мира — для тестов детерминизма и проверки сейвов. */
export function worldHash(w: SimWorld): number {
  const ents = [...unitQuery(w.ecs)].sort((a, b) => Unit.sid[a]! - Unit.sid[b]!);
  let h = 0x811c9dc5;
  const mix = (v: number) => { h ^= v & 0xffffffff; h = Math.imul(h, 0x01000193) >>> 0; };
  mix(w.tick);
  for (const p of w.players) mix(p.metal);
  for (const e of ents) {
    mix(Unit.sid[e]!); mix(Position.x[e]!); mix(Position.y[e]!); mix(Facing.angle[e]!); mix(Health.hp[e]!);
    mix(w.orders.get(e)?.length ?? 0);
  }
  mix(w.projectiles.length);
  return h >>> 0;
}
