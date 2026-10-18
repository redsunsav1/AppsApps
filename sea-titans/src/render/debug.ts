import { Graphics } from 'pixi.js';
import { Position } from '../sim/components';
import { NAV_FLOW, NAV_PATH, unitQuery, type SimWorld } from '../sim/world';
import type { HeightField, Iso } from './iso';

/** F4: пути, слоты формаций, заблокированные клетки. */
export class DebugDraw {
  readonly g = new Graphics();
  enabled = false;
  private blockedDrawn = false;
  readonly blockedG = new Graphics();

  constructor(private readonly iso: Iso, private readonly heights: HeightField) {
    this.blockedG.visible = false;
  }

  private p(tx: number, ty: number): [number, number] {
    return [this.iso.x(tx, ty), this.iso.y(tx, ty, Math.max(0, this.heights.sample(tx, ty)))];
  }

  draw(w: SimWorld): void {
    this.g.clear();
    this.blockedG.visible = this.enabled;
    if (!this.enabled) return;
    if (!this.blockedDrawn) {
      this.blockedDrawn = true;
      const grid = w.grid;
      for (let y = 0; y < grid.h; y++) for (let x = 0; x < grid.width; x++) {
        if (!grid.blocked[grid.idx(x, y)]) continue;
        const a = this.p(x, y), b = this.p(x + 1, y), c = this.p(x + 1, y + 1), d = this.p(x, y + 1);
        this.blockedG.poly([...a, ...b, ...c, ...d]).fill({ color: 0xff3030, alpha: 0.18 });
      }
    }
    const ents = unitQuery(w.ecs);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const q = w.orders.get(e);
      if (!q || q.length === 0) continue;
      const nav = w.nav.get(e);
      let [px, py] = this.p(Position.x[e]! / 1024, Position.y[e]! / 1024);
      const color = nav?.mode === NAV_FLOW ? 0x4fd0ff : nav?.mode === NAV_PATH ? 0xffc04f : 0x7dff8a;
      if (nav?.mode === NAV_PATH) {
        for (let k = nav.wp; k < nav.pts.length / 2; k++) {
          const [nx, ny] = this.p(nav.pts[k * 2]! / 1024, nav.pts[k * 2 + 1]! / 1024);
          this.g.moveTo(px, py).lineTo(nx, ny);
          px = nx; py = ny;
        }
      }
      for (const o of q) {
        const [ox, oy] = this.p(o.x / 1024, o.y / 1024);
        this.g.moveTo(px, py).lineTo(ox, oy);
        this.g.circle(ox, oy, 3);
        px = ox; py = oy;
      }
      this.g.stroke({ width: 1.5, color, alpha: 0.7 });
    }
  }
}
