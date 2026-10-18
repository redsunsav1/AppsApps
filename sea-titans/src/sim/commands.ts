import { entityExists, hasComponent } from 'bitecs';
import { ONE, fatan2, fcos, fsin, tileCenter, toFixed } from '../core/fixed';
import { Mover, Owner, Position, Unit } from './components';
import type { OrderType, SimWorld } from './world';

/** Единственный вход в симуляцию: приказы игрока и ИИ. */
export type Command =
  | { type: 'move'; player: number; units: number[]; x: number; y: number; mode: OrderType; queue: boolean }
  | { type: 'stop'; player: number; units: number[] }
  | { type: 'hold'; player: number; units: number[] };

export function applyCommands(w: SimWorld): void {
  const cmds = w.pending;
  w.pending = [];
  for (const cmd of cmds) {
    const units = cmd.units.filter((e) => entityExists(w.ecs, e) && hasComponent(w.ecs, Mover, e) && Owner.player[e] === cmd.player);
    if (units.length === 0) continue;
    switch (cmd.type) {
      case 'move': applyMove(w, units, cmd.x, cmd.y, cmd.mode, cmd.queue); break;
      case 'stop':
        for (const e of units) { clearOrders(w, e); Mover.hold[e] = 0; }
        break;
      case 'hold':
        for (const e of units) { clearOrders(w, e); Mover.hold[e] = 1; }
        break;
    }
  }
}

function clearOrders(w: SimWorld, e: number): void {
  w.orders.get(e)!.length = 0;
  w.nav.delete(e);
}

/** Точка, откуда юнит начнёт выполнять новый приказ (конец очереди при Shift). */
function startPoint(w: SimWorld, e: number, queue: boolean): [number, number] {
  const q = w.orders.get(e)!;
  if (queue && q.length > 0) { const last = q[q.length - 1]!; return [last.x, last.y]; }
  return [Position.x[e]!, Position.y[e]!];
}

function applyMove(w: SimWorld, units: number[], tx: number, ty: number, mode: OrderType, queue: boolean): void {
  const grid = w.grid;
  const n = units.length;
  // детерминированный порядок
  units = [...units].sort((a, b) => Unit.sid[a]! - Unit.sid[b]!);
  const starts = units.map((e) => startPoint(w, e, queue));

  let cx = 0, cy = 0, maxR = 0;
  for (let i = 0; i < n; i++) { cx += starts[i]![0]; cy += starts[i]![1]; maxR = Math.max(maxR, Mover.radius[units[i]!]!); }
  cx = Math.trunc(cx / n);
  cy = Math.trunc(cy / n);

  // ось формации: вперёд — от центра группы к цели
  let ang = fatan2(ty - cy, tx - cx);
  if (tx === cx && ty === cy) ang = 0;
  const fx = fcos(ang), fy = fsin(ang); // fixed, |f| ≈ ONE
  const rx = -fy, ry = fx;

  const slots: [number, number][] = new Array(n);
  if (n === 1) {
    slots[0] = [tx, ty];
  } else {
    const spacing = maxR * 2 + toFixed(w.reg.game.movement.formationSpacing);
    const cols = Math.min(n, Math.ceil(Math.sqrt(n * 2)));
    // фронт — ближайшие к цели, внутри ряда — по поперечной оси (меньше пересечений)
    const order = units.map((_, i) => i).sort((a, b) => {
      const pa = proj(starts[a]!, cx, cy, fx, fy), pb = proj(starts[b]!, cx, cy, fx, fy);
      return pb - pa || a - b;
    });
    for (let row = 0; row * cols < n; row++) {
      const inRow = order.slice(row * cols, row * cols + cols)
        .sort((a, b) => proj(starts[a]!, cx, cy, rx, ry) - proj(starts[b]!, cx, cy, rx, ry) || a - b);
      const k = inRow.length;
      for (let col = 0; col < k; col++) {
        const lat = Math.trunc(((2 * col - (k - 1)) * spacing) / 2);
        const back = row * spacing;
        slots[inRow[col]!] = [
          tx + Math.trunc((rx * lat - fx * back) / ONE),
          ty + Math.trunc((ry * lat - fy * back) / ONE),
        ];
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const e = units[i]!;
    let [sx, sy] = slots[i]!;
    let tileX = sx >> 10, tileY = sy >> 10;
    if (grid.isBlocked(tileX, tileY)) {
      const c = grid.nearestPassable(tileX, tileY);
      if (c < 0) continue;
      tileX = c % grid.width; tileY = (c / grid.width) | 0;
      sx = tileCenter(tileX); sy = tileCenter(tileY);
    }
    if (!queue) clearOrders(w, e);
    Mover.hold[e] = 0;
    const [ox, oy] = starts[i]!;
    w.orders.get(e)!.push({ type: mode, x: sx, y: sy, gx: tx, gy: ty, groupSize: n, ox, oy });
  }
}

const proj = (p: [number, number], cx: number, cy: number, ax: number, ay: number): number =>
  Math.trunc(((p[0] - cx) * ax + (p[1] - cy) * ay) / ONE);

