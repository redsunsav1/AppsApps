import { ANGLE_HALF, ONE, angleDiff, clamp, fatan2, fcos, fsin } from '../../core/fixed';
import { resolveTerrain } from '../map/collide';
import { Facing, Mover, Position, Velocity } from '../components';
import { unitQuery, type SimWorld } from '../world';

const TURN_FULL_SPEED = 8192; // до 45° отклонения едем на полной скорости

/** Тяжёлые лодки: поворот с ограниченной скоростью, разгон/торможение, движение только носом вперёд. */
export function movementSystem(w: SimWorld): void {
  const m = w.reg.game.movement;
  const minFactor = Math.round(m.turnSlowdownMin * ONE);
  const ents = unitQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    let angle = Facing.angle[e]!;
    let target = 0;
    const wx = w.wantX.get(e);
    if (wx !== undefined && !Mover.hold[e]) {
      const wy = w.wantY.get(e)!;
      const diff = angleDiff(angle, fatan2(wy, wx));
      const tr = Mover.turnRate[e]!;
      const turn = clamp(diff, -tr, tr);
      angle = (angle + turn) & 0xffff;
      const rest = Math.abs(diff - turn);
      let factor = ONE;
      if (rest > TURN_FULL_SPEED) {
        factor = ONE - Math.trunc(((ONE - minFactor) * (rest - TURN_FULL_SPEED)) / (ANGLE_HALF - TURN_FULL_SPEED));
      }
      target = Math.trunc((w.wantSpeed.get(e)! * factor) / ONE);
    }
    Facing.angle[e] = angle;

    const max = Mover.speed[e]!;
    const acc = Math.max(1, Math.trunc(max / m.accelerationTicks));
    let cur = Mover.cur[e]!;
    if (cur < target) cur = Math.min(target, cur + acc);
    else if (cur > target) cur = Math.max(target, cur - acc * 2);
    Mover.cur[e] = cur;
    if (cur === 0) { Velocity.x[e] = 0; Velocity.y[e] = 0; continue; }

    const nx = Position.x[e]! + Math.trunc((fcos(angle) * cur) / ONE);
    const ny = Position.y[e]! + Math.trunc((fsin(angle) * cur) / ONE);
    const [rx, ry] = resolveTerrain(w.grid, nx, ny, Mover.radius[e]!);
    Position.x[e] = rx;
    Position.y[e] = ry;
  }
}
