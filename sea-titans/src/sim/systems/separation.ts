import { toFixed } from '../../core/fixed';
import { resolveTerrain } from '../map/collide';
import { Mover, Position, Unit, Velocity } from '../components';
import { unitQuery, type SimWorld } from '../world';

/**
 * Юниты не слипаются: позиционное расталкивание пересекающихся кругов.
 * Удерживающие позицию не сдвигаются, стоящие без приказа уступают движущимся.
 */
export function separationSystem(w: SimWorld): void {
  const ents = unitQuery(w.ecs);
  const margin = toFixed(w.reg.game.movement.separationMargin);
  let maxR = 0;
  for (const u of w.reg.units) maxR = Math.max(maxR, u.radius);
  w.spatial.rebuild(ents, Position.x, Position.y);

  for (let i = 0; i < ents.length; i++) {
    const a = ents[i]!;
    const ra = Mover.radius[a]!;
    const sa = Unit.sid[a]!;
    w.spatial.query(Position.x[a]!, Position.y[a]!, ra + maxR + margin, (b) => {
      if (Unit.sid[b]! <= sa) return;
      // слои глубины: лодки на разной высоте не толкаются, если разница больше одного слоя
      if (Math.abs(Mover.layer[a]! - Mover.layer[b]!) > 1) return;
      const dx = Position.x[b]! - Position.x[a]!;
      const dy = Position.y[b]! - Position.y[a]!;
      const min = ra + Mover.radius[b]! + margin;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      let d = Math.floor(Math.sqrt(d2));
      let ux = dx, uy = dy;
      if (d === 0) { ux = ((sa * 7919) & 255) - 128 || 1; uy = (((sa * 104729) >> 3) & 255) - 128; d = Math.floor(Math.sqrt(ux * ux + uy * uy)) || 1; }
      const overlap = min - d;
      const wa = softness(w, a), wb = softness(w, b);
      const sum = wa + wb;
      if (sum === 0) return;
      const pa = Math.trunc((overlap * wa) / sum);
      const pb = overlap - pa;
      if (pa > 0) {
        const [x, y] = resolveTerrain(w.grid, Position.x[a]! - Math.trunc((ux * pa) / d), Position.y[a]! - Math.trunc((uy * pa) / d), ra);
        Position.x[a] = x; Position.y[a] = y;
      }
      if (pb > 0 && wb > 0) {
        const rb = Mover.radius[b]!;
        const [x, y] = resolveTerrain(w.grid, Position.x[b]! + Math.trunc((ux * pb) / d), Position.y[b]! + Math.trunc((uy * pb) / d), rb);
        Position.x[b] = x; Position.y[b] = y;
      }
    });
  }

  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    Velocity.x[e] = Position.x[e]! - Position.px[e]!;
    Velocity.y[e] = Position.y[e]! - Position.py[e]!;
  }
}

/** Насколько легко сдвинуть юнит: удержание — 0, движется — 1, стоит — 2. */
function softness(w: SimWorld, e: number): number {
  if (Mover.hold[e]) return 0;
  const q = w.orders.get(e);
  return q && q.length > 0 ? 1 : 2;
}
