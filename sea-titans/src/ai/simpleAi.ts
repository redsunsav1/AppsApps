import { hasComponent } from 'bitecs';
import { length, toFixed } from '../core/fixed';
import { Building, Harvester, Owner, Position, Unit, Weapon } from '../sim/components';
import { buildingQuery, enqueue, unitQuery, type SimWorld } from '../sim/world';

/**
 * Простой ИИ этапа: держит N сборщиков, строит армию по весам из конфига,
 * защищает базу и отправляет растущие волны на ближайшую вражескую базу.
 * Ходит только командами — как игрок.
 */
export function aiSystem(w: SimWorld): void {
  const cfg = w.reg.game.ai;
  if (w.tick % cfg.thinkInterval !== 0 || w.winner >= 0) return;
  w.players.forEach((p, i) => { if (p.ai && p.alive) think(w, i); });
}

function think(w: SimWorld, me: number): void {
  const cfg = w.reg.game.ai;
  const ps = w.players[me]!;
  const hq = ownBase(w, me);
  if (hq < 0) return;
  const prod = w.prod.get(hq)!;
  const units = unitQuery(w.ecs);

  let harvesters = 0;
  const army: number[] = [];
  const idle: number[] = [];
  for (let i = 0; i < units.length; i++) {
    const e = units[i]!;
    if (Owner.player[e] !== me || hasComponent(w.ecs, Building, e)) continue;
    if (hasComponent(w.ecs, Harvester, e)) { harvesters++; continue; }
    if (!hasComponent(w.ecs, Weapon, e)) continue;
    army.push(e);
    if (w.orders.get(e)!.length === 0) idle.push(e);
  }

  // производство
  const harvDef = w.reg.units.find((u) => u.raw.kind === 'harvester' && w.reg.units[Unit.def[hq]!]!.produces.includes(u.index));
  const queuedHarv = prod.queue.filter((d) => d === harvDef?.index).length;
  if (harvDef && harvesters + queuedHarv < cfg.harvesters) {
    if (queuedHarv === 0 && ps.metal >= harvDef.raw.cost) enqueue(w, { type: 'produce', player: me, building: hq, def: harvDef.index });
  } else if (prod.queue.length < 2) {
    const pick = weightedPick(w, cfg.mix);
    const def = pick !== null ? w.reg.unitById.get(pick) : undefined;
    if (def && ps.metal >= def.raw.cost) enqueue(w, { type: 'produce', player: me, building: hq, def: def.index });
  }

  // оборона: враг рядом с базой — все свободные и уходящие в атаку разворачиваются
  const threat = nearestEnemyTo(w, me, Position.x[hq]!, Position.y[hq]!, toFixed(cfg.defendRadius));
  if (threat >= 0) {
    const defenders = army.filter((e) => length(Position.x[e]! - Position.x[hq]!, Position.y[e]! - Position.y[hq]!) < toFixed(cfg.defendRadius * 2));
    if (defenders.length) enqueue(w, { type: 'move', player: me, units: defenders, x: Position.x[threat]!, y: Position.y[threat]!, mode: 'amove', queue: false });
    return;
  }

  // волна
  if (w.tick >= cfg.firstWaveTick && idle.length >= ps.wave) {
    const target = enemyBase(w, me, Position.x[hq]!, Position.y[hq]!);
    if (target >= 0) {
      enqueue(w, { type: 'move', player: me, units: idle, x: Position.x[target]!, y: Position.y[target]!, mode: 'amove', queue: false });
      ps.wave = Math.min(cfg.waveMax, ps.wave + cfg.waveGrow);
    }
  }
}

function weightedPick(w: SimWorld, mix: Record<string, number>): string | null {
  const ids = Object.keys(mix).sort();
  const total = ids.reduce((s, id) => s + mix[id]!, 0);
  if (total <= 0) return null;
  let r = (w.rng.int(1_000_000) / 1_000_000) * total;
  for (const id of ids) { r -= mix[id]!; if (r < 0) return id; }
  return ids[ids.length - 1]!;
}

function ownBase(w: SimWorld, me: number): number {
  const bs = buildingQuery(w.ecs);
  for (let i = 0; i < bs.length; i++) if (Owner.player[bs[i]!] === me && w.prod.has(bs[i]!)) return bs[i]!;
  return -1;
}

function enemyBase(w: SimWorld, me: number, x: number, y: number): number {
  const bs = buildingQuery(w.ecs);
  let best = -1, bestD = Infinity;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i]!;
    if (Owner.player[b] === me) continue;
    const d = length(Position.x[b]! - x, Position.y[b]! - y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function nearestEnemyTo(w: SimWorld, me: number, x: number, y: number, r: number): number {
  let best = -1, bestD = Infinity;
  w.spatial.query(x, y, r, (o) => {
    if (Owner.player[o] === me || hasComponent(w.ecs, Building, o)) return;
    const d = length(Position.x[o]! - x, Position.y[o]! - y);
    if (d <= r && d < bestD) { bestD = d; best = o; }
  });
  return best;
}
