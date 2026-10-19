import { fatan2, length } from '../../core/fixed';
import { resolveTerrain } from '../map/collide';
import { Facing, Mover, Position } from '../components';
import { unitQuery, type SimWorld } from '../world';

/**
 * Движение в духе 8-bit: без инерции и разворотов — сразу полный ход в нужную сторону
 * и мгновенная остановка. Нос смотрит туда, куда едем.
 */
export function movementSystem(w: SimWorld): void {
  const ents = unitQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    if (Mover.speed[e] === 0 || Mover.hold[e]) continue;
    const wx = w.wantX.get(e);
    if (wx === undefined) continue;
    const wy = w.wantY.get(e)!;
    const len = length(wx, wy);
    if (len === 0) continue;
    const sp = Math.min(w.wantSpeed.get(e)!, len);
    Facing.angle[e] = fatan2(wy, wx);
    const [x, y] = resolveTerrain(w.grid, Position.x[e]! + Math.trunc((wx * sp) / len), Position.y[e]! + Math.trunc((wy * sp) / len), Mover.radius[e]!);
    Position.x[e] = x;
    Position.y[e] = y;
  }
}
