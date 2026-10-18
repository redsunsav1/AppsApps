import { entityExists, hasComponent } from 'bitecs';
import { ONE, fcos, fsin, fatan2, length, tileCenter, toFixed } from '../../core/fixed';
import { Building, Facing, Harvester, Mover, Owner, Position, ResourceNode, Unit } from '../components';
import { clearOrders } from '../commands';
import { buildingQuery, despawn, emit, harvesterQuery, nodeQuery, spawnUnit, unitQuery, type SimWorld } from '../world';

const ST_MANUAL = 0, ST_TO_NODE = 1, ST_MINING = 2, ST_TO_BASE = 3;

/** Сборщики: к месторождению → добыча → к базе → сдать металл → снова. */
export function harvestSystem(w: SimWorld): void {
  const eco = w.reg.game.economy;
  const reachNode = toFixed(eco.depositReach);
  const reachBase = toFixed(eco.dropoffReach);
  const ents = harvesterQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    const def = w.reg.units[Unit.def[e]!]!;
    const q = w.orders.get(e)!;
    const x = Position.x[e]!, y = Position.y[e]!;
    switch (Harvester.state[e]) {
      case ST_MANUAL:
        // после ручного приказа сборщик возвращается к работе, постояв немного
        if (q.length > 0) { Harvester.timer[e] = 0; break; }
        if (++Harvester.timer[e]! >= eco.harvesterResumeTicks) { Harvester.timer[e] = 0; Harvester.state[e] = Harvester.carry[e]! > 0 ? ST_TO_BASE : ST_TO_NODE; }
        break;
      case ST_TO_NODE: {
        let node = Harvester.node[e]!;
        if (!nodeAlive(w, node)) { node = nearestNode(w, x, y); Harvester.node[e] = node; }
        if (node < 0) { Harvester.state[e] = ST_MANUAL; break; }
        if (length(Position.x[node]! - x, Position.y[node]! - y) <= reachNode) {
          clearOrders(w, e);
          Harvester.state[e] = ST_MINING;
          Harvester.timer[e] = 0;
        } else if (q.length === 0) {
          pushMove(w, e, Position.x[node]!, Position.y[node]!);
        }
        break;
      }
      case ST_MINING: {
        const node = Harvester.node[e]!;
        if (!nodeAlive(w, node)) { Harvester.state[e] = Harvester.carry[e]! > 0 ? ST_TO_BASE : ST_TO_NODE; break; }
        if (++Harvester.timer[e]! >= def.harvestTicksPerUnit) {
          Harvester.timer[e] = 0;
          ResourceNode.amount[node]!--;
          Harvester.carry[e]!++;
          if (ResourceNode.amount[node]! <= 0) despawn(w, node);
        }
        if (Harvester.carry[e]! >= def.raw.harvest!.capacity || !nodeAlive(w, node)) Harvester.state[e] = ST_TO_BASE;
        break;
      }
      case ST_TO_BASE: {
        const hq = nearestBase(w, Owner.player[e]!, x, y);
        if (hq < 0) { Harvester.state[e] = ST_MANUAL; break; }
        const edge = length(Position.x[hq]! - x, Position.y[hq]! - y) - Mover.radius[hq]! - Mover.radius[e]!;
        if (edge <= reachBase) {
          clearOrders(w, e);
          const amount = Harvester.carry[e]!;
          w.players[Owner.player[e]!]!.metal += amount;
          Harvester.carry[e] = 0;
          Harvester.state[e] = ST_TO_NODE;
          emit(w, { t: 'deposit', owner: Owner.player[e]!, amount });
        } else if (q.length === 0) {
          pushMove(w, e, Position.x[hq]!, Position.y[hq]!);
        }
        break;
      }
    }
  }
}

function pushMove(w: SimWorld, e: number, x: number, y: number): void {
  w.orders.get(e)!.push({ type: 'move', x, y, gx: x, gy: y, groupSize: 1, ox: x, oy: y, tgt: -1 });
}

const nodeAlive = (w: SimWorld, n: number): boolean =>
  n >= 0 && entityExists(w.ecs, n) && hasComponent(w.ecs, ResourceNode, n) && ResourceNode.amount[n]! > 0;

export function nearestNode(w: SimWorld, x: number, y: number): number {
  const nodes = nodeQuery(w.ecs);
  let best = -1, bestD = Infinity, bestSid = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (ResourceNode.amount[n]! <= 0) continue;
    const d = length(Position.x[n]! - x, Position.y[n]! - y);
    const sid = ResourceNode.sid[n]!;
    if (d < bestD || (d === bestD && sid < bestSid)) { bestD = d; best = n; bestSid = sid; }
  }
  return best;
}

/** Ближайшее своё здание, которое принимает металл (сейчас — любое производящее). */
export function nearestBase(w: SimWorld, player: number, x: number, y: number): number {
  const bs = buildingQuery(w.ecs);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    if (Owner.player[b] !== player || !w.prod.has(b) || w.dead.has(b)) continue;
    const d = length(Position.x[b]! - x, Position.y[b]! - y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

export function unitCount(w: SimWorld, player: number): number {
  const ents = unitQuery(w.ecs);
  let n = 0;
  for (let i = 0; i < ents.length; i++) if (Owner.player[ents[i]!] === player && !hasComponent(w.ecs, Building, ents[i]!)) n++;
  return n;
}

/** Очереди производства в зданиях. Новый юнит выходит со стороны точки сбора. */
export function productionSystem(w: SimWorld): void {
  const cap = w.reg.game.economy.unitCap;
  const counts = new Map<number, number>();
  for (const [b, p] of w.prod) {
    if (!entityExists(w.ecs, b) || w.dead.has(b) || p.queue.length === 0) continue;
    const owner = Owner.player[b]!;
    if (!counts.has(owner)) counts.set(owner, unitCount(w, owner));
    if (counts.get(owner)! >= cap) continue;
    const def = w.reg.units[p.queue[0]!]!;
    if (++p.progress < def.buildTicks) continue;
    p.queue.shift();
    p.progress = 0;
    counts.set(owner, counts.get(owner)! + 1);

    const bx = Position.x[b]!, by = Position.y[b]!;
    let ang = fatan2(p.rallyY - by, p.rallyX - bx);
    if (p.rallyX === bx && p.rallyY === by) ang = bx < (w.grid.width * ONE) / 2 ? 0 : 32768;
    const out = Mover.radius[b]! + def.radius + (ONE >> 2);
    let sx = bx + Math.trunc((fcos(ang) * out) / ONE);
    let sy = by + Math.trunc((fsin(ang) * out) / ONE);
    if (w.grid.isBlocked(sx >> 10, sy >> 10)) {
      const c = w.grid.nearestPassable(sx >> 10, sy >> 10);
      if (c >= 0) { sx = tileCenter(c % w.grid.width); sy = tileCenter((c / w.grid.width) | 0); }
    }
    const e = spawnUnit(w, def.index, owner, sx, sy, ang);
    if (def.raw.kind !== 'harvester' && (p.rallyX !== bx || p.rallyY !== by)) pushMove(w, e, p.rallyX, p.rallyY);
    emit(w, { t: 'built', owner, def: def.index });
  }
}

/** Гибель: взрыв, удаление, проверка победы (игрок без зданий выбывает). */
export function deathSystem(w: SimWorld): void {
  if (w.dead.size === 0) return;
  const dead = [...w.dead].sort((a, b) => Unit.sid[a]! - Unit.sid[b]!);
  w.dead.clear();
  for (const e of dead) {
    if (!entityExists(w.ecs, e)) continue;
    const building = hasComponent(w.ecs, Building, e);
    emit(w, { t: 'death', x: Position.x[e]!, y: Position.y[e]!, r: Mover.radius[e]!, owner: Owner.player[e]!, building, def: Unit.def[e]!, angle: Facing.angle[e]! });
    despawn(w, e);
  }
  if (w.winner >= 0) return;
  const bs = buildingQuery(w.ecs);
  const hasBase = new Set<number>();
  for (let i = 0; i < bs.length; i++) hasBase.add(Owner.player[bs[i]!]!);
  w.players.forEach((p, i) => { if (p.alive && !hasBase.has(i)) p.alive = false; });
  const alive = w.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
  if (alive.length === 1) { w.winner = alive[0]!; emit(w, { t: 'win', player: w.winner }); }
}
