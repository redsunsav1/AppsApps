import { entityExists, hasComponent } from 'bitecs';
import { ONE, fatan2, fcos, fsin, tileCenter, toFixed } from '../core/fixed';
import { Building, Harvester, Mover, Owner, Position, ResourceNode, Unit, Weapon } from './components';
import type { OrderType, SimWorld } from './world';

/** Единственный вход в симуляцию: приказы игрока и ИИ. */
export type Command =
  | { type: 'move'; player: number; units: number[]; x: number; y: number; mode: Exclude<OrderType, 'attack'>; queue: boolean }
  | { type: 'attack'; player: number; units: number[]; target: number; queue: boolean }
  | { type: 'harvest'; player: number; units: number[]; node: number }
  | { type: 'stop'; player: number; units: number[] }
  | { type: 'hold'; player: number; units: number[] }
  | { type: 'produce'; player: number; building: number; def: number }
  | { type: 'cancel'; player: number; building: number }
  | { type: 'rally'; player: number; building: number; x: number; y: number };

const owned = (w: SimWorld, e: number, player: number): boolean => entityExists(w.ecs, e) && hasComponent(w.ecs, Unit, e) && Owner.player[e] === player;

export function applyCommands(w: SimWorld): void {
  const cmds = w.pending;
  w.pending = [];
  for (const cmd of cmds) {
    if (!w.players[cmd.player]?.alive) continue;
    switch (cmd.type) {
      case 'produce': produce(w, cmd.player, cmd.building, cmd.def); continue;
      case 'cancel': cancel(w, cmd.player, cmd.building); continue;
      case 'rally': {
        const p = w.prod.get(cmd.building);
        if (p && owned(w, cmd.building, cmd.player)) { p.rallyX = cmd.x; p.rallyY = cmd.y; }
        continue;
      }
    }
    const units = cmd.units.filter((e) => owned(w, e, cmd.player) && Mover.speed[e]! > 0);
    if (units.length === 0) continue;
    switch (cmd.type) {
      case 'move':
        for (const e of units) if (hasComponent(w.ecs, Harvester, e)) { Harvester.state[e] = 0; Harvester.timer[e] = 0; }
        applyMove(w, units, cmd.x, cmd.y, cmd.mode, cmd.queue);
        break;
      case 'attack': {
        if (!entityExists(w.ecs, cmd.target) || !hasComponent(w.ecs, Unit, cmd.target)) break;
        for (const e of units) {
          if (!hasComponent(w.ecs, Weapon, e)) continue;
          if (!cmd.queue) clearOrders(w, e);
          Mover.hold[e] = 0;
          const tx = Position.x[cmd.target]!, ty = Position.y[cmd.target]!;
          w.orders.get(e)!.push({ type: 'attack', x: tx, y: ty, gx: tx, gy: ty, groupSize: 1, ox: tx, oy: ty, tgt: cmd.target });
        }
        break;
      }
      case 'harvest': {
        if (!entityExists(w.ecs, cmd.node) || !hasComponent(w.ecs, ResourceNode, cmd.node)) break;
        for (const e of units) {
          if (!hasComponent(w.ecs, Harvester, e)) continue;
          clearOrders(w, e);
          Harvester.node[e] = cmd.node;
          Harvester.state[e] = Harvester.carry[e]! > 0 && Harvester.state[e] === 3 ? 3 : 1;
        }
        break;
      }
      case 'stop':
        for (const e of units) { clearOrders(w, e); Mover.hold[e] = 0; }
        break;
      case 'hold':
        for (const e of units) { clearOrders(w, e); Mover.hold[e] = 1; }
        break;
    }
  }
}

export function clearOrders(w: SimWorld, e: number): void {
  w.orders.get(e)!.length = 0;
  w.nav.delete(e);
}

function produce(w: SimWorld, player: number, b: number, def: number): void {
  const p = w.prod.get(b);
  if (!p || !owned(w, b, player) || !hasComponent(w.ecs, Building, b)) return;
  const bdef = w.reg.units[Unit.def[b]!]!;
  const udef = w.reg.units[def];
  if (!udef || !bdef.produces.includes(def)) return;
  const ps = w.players[player]!;
  if (p.queue.length >= w.reg.game.economy.queueMax || ps.metal < udef.raw.cost) return;
  ps.metal -= udef.raw.cost;
  p.queue.push(def);
}

function cancel(w: SimWorld, player: number, b: number): void {
  const p = w.prod.get(b);
  if (!p || !owned(w, b, player) || p.queue.length === 0) return;
  const def = p.queue.pop()!;
  w.players[player]!.metal += w.reg.units[def]!.raw.cost;
  if (p.queue.length === 0) p.progress = 0;
}

/** Точка, откуда юнит начнёт выполнять новый приказ (конец очереди при Shift). */
function startPoint(w: SimWorld, e: number, queue: boolean): [number, number] {
  const q = w.orders.get(e)!;
  if (queue && q.length > 0) { const last = q[q.length - 1]!; return [last.x, last.y]; }
  return [Position.x[e]!, Position.y[e]!];
}

export function applyMove(w: SimWorld, units: number[], tx: number, ty: number, mode: OrderType, queue: boolean): void {
  const grid = w.grid;
  const n = units.length;
  units = [...units].sort((a, b) => Unit.sid[a]! - Unit.sid[b]!);
  const starts = units.map((e) => startPoint(w, e, queue));

  let cx = 0, cy = 0, maxR = 0;
  for (let i = 0; i < n; i++) { cx += starts[i]![0]; cy += starts[i]![1]; maxR = Math.max(maxR, Mover.radius[units[i]!]!); }
  cx = Math.trunc(cx / n);
  cy = Math.trunc(cy / n);

  // ось формации: вперёд — от центра группы к цели
  const ang = tx === cx && ty === cy ? 0 : fatan2(ty - cy, tx - cx);
  const fx = fcos(ang), fy = fsin(ang);
  const rx = -fy, ry = fx;

  const slots: [number, number][] = new Array(n);
  if (n === 1) {
    slots[0] = [tx, ty];
  } else {
    const spacing = maxR * 2 + toFixed(w.reg.game.movement.formationSpacing);
    const cols = Math.min(n, Math.ceil(Math.sqrt(n * 2)));
    const order = units.map((_, i) => i).sort((a, b) => proj(starts[b]!, cx, cy, fx, fy) - proj(starts[a]!, cx, cy, fx, fy) || a - b);
    for (let row = 0; row * cols < n; row++) {
      const inRow = order.slice(row * cols, row * cols + cols)
        .sort((a, b) => proj(starts[a]!, cx, cy, rx, ry) - proj(starts[b]!, cx, cy, rx, ry) || a - b);
      const k = inRow.length;
      for (let col = 0; col < k; col++) {
        const lat = Math.trunc(((2 * col - (k - 1)) * spacing) / 2);
        const back = row * spacing;
        slots[inRow[col]!] = [tx + Math.trunc((rx * lat - fx * back) / ONE), ty + Math.trunc((ry * lat - fy * back) / ONE)];
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const e = units[i]!;
    let [sx, sy] = slots[i]!;
    if (grid.isBlocked(sx >> 10, sy >> 10)) {
      const c = grid.nearestPassable(sx >> 10, sy >> 10);
      if (c < 0) continue;
      sx = tileCenter(c % grid.width); sy = tileCenter((c / grid.width) | 0);
    }
    if (!queue) clearOrders(w, e);
    Mover.hold[e] = 0;
    const [ox, oy] = starts[i]!;
    w.orders.get(e)!.push({ type: mode, x: sx, y: sy, gx: tx, gy: ty, groupSize: n, ox, oy, tgt: -1 });
  }
}

const proj = (p: [number, number], cx: number, cy: number, ax: number, ay: number): number =>
  Math.trunc(((p[0] - cx) * ax + (p[1] - cy) * ay) / ONE);
