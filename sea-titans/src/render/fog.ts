import { hasComponent } from 'bitecs';
import type { Registry } from '../data/registry';
import { Owner, Position, Unit } from '../sim/components';
import { unitQuery, type SimWorld } from '../sim/world';

/**
 * Туман войны для отрисовки: неразведанное — чёрное, разведанное — затемнено дизерингом.
 * ИИ этот туман не использует (в ТЗ: ИИ не видит сквозь туман — будет на этапе ИИ).
 */
export class Fog {
  readonly visible: Uint8Array;
  readonly explored: Uint8Array;

  constructor(private readonly w: number, private readonly h: number, private readonly reg: Registry) {
    this.visible = new Uint8Array(w * h);
    this.explored = new Uint8Array(w * h);
  }

  update(sim: SimWorld, player: number): void {
    this.visible.fill(0);
    const ents = unitQuery(sim.ecs);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      if (Owner.player[e] !== player || !hasComponent(sim.ecs, Unit, e)) continue;
      const r = this.reg.units[Unit.def[e]!]!.raw.sight;
      const cx = Position.x[e]! / 1024, cy = Position.y[e]! / 1024;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(this.w - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(this.h - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
        this.visible[y * this.w + x] = 1;
        this.explored[y * this.w + x] = 1;
      }
    }
  }

  isVisible(tx: number, ty: number): boolean {
    tx = Math.floor(tx); ty = Math.floor(ty);
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.visible[ty * this.w + tx] === 1;
  }

  isExplored(tx: number, ty: number): boolean {
    tx = Math.floor(tx); ty = Math.floor(ty);
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h && this.explored[ty * this.w + tx] === 1;
  }
}
