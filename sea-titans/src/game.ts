import { entityExists } from 'bitecs';
import { toFixed } from './core/fixed';
import type { Registry } from './data/registry';
import type { Camera } from './render/camera';
import type { EntityRenderer } from './render/entities';
import type { HeightField, Iso } from './render/iso';
import { Owner, Unit } from './sim/components';
import { enqueue, type OrderType, type SimWorld } from './sim/world';

/** Связка ввода с симуляцией: выделение, группы, выдача команд. Сам ничего не симулирует. */
export class GameController {
  readonly selection = new Set<number>();
  private readonly groups = new Map<number, number[]>();
  /** Режим ожидания цели после хоткея (атака-движение, патруль). */
  pendingMode: OrderType | null = null;
  onOrder: ((wx: number, wy: number, mode: OrderType) => void) | null = null;

  constructor(
    readonly sim: SimWorld,
    readonly reg: Registry,
    private readonly camera: Camera,
    private readonly iso: Iso,
    private readonly heights: HeightField,
    private readonly entities: EntityRenderer,
    readonly player = 0,
  ) {}

  /** Экран → тайлы с поправкой на высоту рельефа (2 итерации). */
  screenToTile(sx: number, sy: number): [number, number] {
    const [wx, wy] = this.camera.toWorld(sx, sy);
    let [tx, ty] = this.iso.toTile(wx, wy);
    for (let i = 0; i < 2; i++) {
      const h = Math.max(0, this.heights.sample(tx, ty));
      [tx, ty] = this.iso.toTile(wx, wy + h * this.iso.heightPx);
    }
    return [Math.max(0, Math.min(this.sim.grid.width - 0.01, tx)), Math.max(0, Math.min(this.sim.grid.h - 0.01, ty))];
  }

  pruneSelection(): void {
    for (const e of this.selection) if (!entityExists(this.sim.ecs, e)) this.selection.delete(e);
  }

  private own(e: number): boolean {
    return Owner.player[e] === this.player;
  }

  private unitsOnScreen(): number[] {
    const out: number[] = [];
    for (const [e, p] of this.entities.bodyPos) {
      const [sx, sy] = this.camera.toScreen(p.x, p.y);
      if (sx >= 0 && sy >= 0 && sx <= this.camera.viewW && sy <= this.camera.viewH) out.push(e);
    }
    return out;
  }

  /** Ближайший юнит под курсором (сначала свои). */
  pick(sx: number, sy: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const [e, p] of this.entities.bodyPos) {
      const [ex, ey] = this.camera.toScreen(p.x, p.y);
      const r = Math.max(14, p.r * this.camera.zoom);
      const d = Math.hypot(ex - sx, (ey - sy) * 1.4);
      if (d > r) continue;
      const score = d - (this.own(e) ? 1000 : 0);
      if (score < bestD) { bestD = score; best = e; }
    }
    return best;
  }

  clickSelect(sx: number, sy: number, add: boolean, double: boolean): void {
    const e = this.pick(sx, sy);
    if (!add) this.selection.clear();
    if (e === null) return;
    if (double && this.own(e)) {
      const def = Unit.def[e];
      for (const o of this.unitsOnScreen()) if (this.own(o) && Unit.def[o] === def) this.selection.add(o);
      return;
    }
    if (add && this.selection.has(e)) this.selection.delete(e);
    else this.selection.add(e);
  }

  boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    if (!add) this.selection.clear();
    for (const [e, p] of this.entities.bodyPos) {
      if (!this.own(e)) continue;
      const [sx, sy] = this.camera.toScreen(p.x, p.y);
      if (sx >= ax && sx <= bx && sy >= ay && sy <= by) this.selection.add(e);
    }
  }

  private mine(): number[] {
    return [...this.selection].filter((e) => this.own(e));
  }

  order(sx: number, sy: number, mode: OrderType, queue: boolean): boolean {
    const units = this.mine();
    if (units.length === 0) return false;
    const [tx, ty] = this.screenToTile(sx, sy);
    enqueue(this.sim, { type: 'move', player: this.player, units, x: toFixed(tx), y: toFixed(ty), mode, queue });
    this.onOrder?.(tx, ty, mode);
    return true;
  }

  stop(): void {
    const units = this.mine();
    if (units.length) enqueue(this.sim, { type: 'stop', player: this.player, units });
  }

  hold(): void {
    const units = this.mine();
    if (units.length) enqueue(this.sim, { type: 'hold', player: this.player, units });
  }

  assignGroup(n: number): void {
    this.groups.set(n, this.mine());
  }

  /** Возвращает центр группы в тайлах, если группа не пуста. */
  recallGroup(n: number, add: boolean): number[] {
    const g = (this.groups.get(n) ?? []).filter((e) => entityExists(this.sim.ecs, e));
    this.groups.set(n, g);
    if (!add) this.selection.clear();
    for (const e of g) this.selection.add(e);
    return g;
  }
}
