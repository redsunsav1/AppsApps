import { entityExists, hasComponent } from 'bitecs';
import { toFixed } from './core/fixed';
import type { Registry } from './data/registry';
import type { Fog } from './render/fog';
import { FX_TO_PX, type Renderer } from './render/renderer';
import { Building, Harvester, Owner, Position, Unit, Weapon } from './sim/components';
import { buildingQuery, enqueue, nodeQuery, type OrderType, type SimWorld } from './sim/world';

export interface Feedback {
  ack(): void;
  denied(): void;
  select(): void;
  marker(wx: number, wy: number, kind: 'move' | 'amove' | 'patrol' | 'attack' | 'harvest' | 'rally'): void;
}

/** Связка ввода с симуляцией: выделение, группы, выдача команд. Сам ничего не симулирует. */
export class GameController {
  readonly selection = new Set<number>();
  private readonly groups = new Map<number, number[]>();
  pendingMode: Exclude<OrderType, 'attack'> | null = null;

  constructor(
    readonly sim: SimWorld,
    readonly reg: Registry,
    private readonly view: Renderer,
    private readonly fog: Fog,
    private readonly fb: Feedback,
    readonly player = 0,
  ) {}

  pruneSelection(): void {
    for (const e of this.selection) if (!entityExists(this.sim.ecs, e) || !hasComponent(this.sim.ecs, Unit, e)) this.selection.delete(e);
  }

  private own(e: number): boolean {
    return Owner.player[e] === this.player;
  }

  /** Юнит под курсором (сначала свои). */
  pick(clientX: number, clientY: number): number | null {
    const [wx, wy] = this.view.toWorld(clientX, clientY);
    let best: number | null = null, bestD = Infinity;
    for (const p of this.view.picks) {
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d > p.r + 2) continue;
      const score = d - (this.own(p.e) ? 100 : 0);
      if (score < bestD) { bestD = score; best = p.e; }
    }
    return best;
  }

  clickSelect(clientX: number, clientY: number, add: boolean, double: boolean): void {
    const e = this.pick(clientX, clientY);
    if (!add) this.selection.clear();
    if (e === null) return;
    if (double && this.own(e)) {
      const def = Unit.def[e];
      for (const p of this.view.picks) if (this.own(p.e) && Unit.def[p.e] === def) this.selection.add(p.e);
    } else if (add && this.selection.has(e)) this.selection.delete(e);
    else this.selection.add(e);
    this.fb.select();
  }

  /** Рамка в координатах экрана. Здания в рамку не попадают, если в ней есть юниты. */
  boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean): void {
    const [ax, ay] = this.view.toWorld(Math.min(x0, x1), Math.min(y0, y1));
    const [bx, by] = this.view.toWorld(Math.max(x0, x1), Math.max(y0, y1));
    if (!add) this.selection.clear();
    const hit = this.view.picks.filter((p) => this.own(p.e) && p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by).map((p) => p.e);
    const mobile = hit.filter((e) => !hasComponent(this.sim.ecs, Building, e));
    for (const e of mobile.length ? mobile : hit) this.selection.add(e);
    if (hit.length) this.fb.select();
  }

  private mine(): number[] {
    return [...this.selection].filter((e) => this.own(e) && entityExists(this.sim.ecs, e));
  }

  private mobile(): number[] {
    return this.mine().filter((e) => !hasComponent(this.sim.ecs, Building, e));
  }

  /** ПКМ: враг — атака, кристаллы — добыча (для сборщиков), только база — точка сбора, иначе движение. */
  rightClick(clientX: number, clientY: number, queue: boolean): void {
    const [wx, wy] = this.view.toWorld(clientX, clientY);
    const fx = toFixed(wx / 16), fy = toFixed(wy / 16);
    const units = this.mobile();
    const buildings = this.mine().filter((e) => hasComponent(this.sim.ecs, Building, e));
    if (units.length === 0) {
      for (const b of buildings) enqueue(this.sim, { type: 'rally', player: this.player, building: b, x: fx, y: fy });
      if (buildings.length) { this.fb.marker(wx, wy, 'rally'); this.fb.ack(); }
      return;
    }
    const target = this.pick(clientX, clientY);
    if (target !== null && !this.own(target) && this.fog.isVisible(wx / 16, wy / 16)) {
      const armed = units.filter((e) => hasComponent(this.sim.ecs, Weapon, e));
      if (armed.length) {
        enqueue(this.sim, { type: 'attack', player: this.player, units: armed, target, queue });
        this.fb.marker(Position.x[target]! / FX_TO_PX, Position.y[target]! / FX_TO_PX, 'attack');
        this.fb.ack();
        return;
      }
    }
    const node = this.nodeAt(wx, wy);
    const harv = units.filter((e) => hasComponent(this.sim.ecs, Harvester, e));
    if (node >= 0 && harv.length) {
      enqueue(this.sim, { type: 'harvest', player: this.player, units: harv, node });
      this.fb.marker(Position.x[node]! / FX_TO_PX, Position.y[node]! / FX_TO_PX, 'harvest');
      const rest = units.filter((e) => !harv.includes(e));
      if (rest.length) enqueue(this.sim, { type: 'move', player: this.player, units: rest, x: fx, y: fy, mode: 'move', queue });
      this.fb.ack();
      return;
    }
    this.order(clientX, clientY, 'move', queue);
  }

  order(clientX: number, clientY: number, mode: Exclude<OrderType, 'attack'>, queue: boolean): boolean {
    const units = this.mobile();
    if (units.length === 0) return false;
    const [wx, wy] = this.view.toWorld(clientX, clientY);
    enqueue(this.sim, { type: 'move', player: this.player, units, x: toFixed(wx / 16), y: toFixed(wy / 16), mode, queue });
    this.fb.marker(wx, wy, mode);
    this.fb.ack();
    return true;
  }

  private nodeAt(wx: number, wy: number): number {
    const nodes = nodeQuery(this.sim.ecs);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      if (Math.hypot(Position.x[n]! / FX_TO_PX - wx, Position.y[n]! / FX_TO_PX - wy) <= 9) return n;
    }
    return -1;
  }

  stop(): void {
    const units = this.mobile();
    if (units.length) { enqueue(this.sim, { type: 'stop', player: this.player, units }); this.fb.ack(); }
  }

  hold(): void {
    const units = this.mobile();
    if (units.length) { enqueue(this.sim, { type: 'hold', player: this.player, units }); this.fb.ack(); }
  }

  base(): number {
    const bs = buildingQuery(this.sim.ecs);
    for (let i = 0; i < bs.length; i++) if (Owner.player[bs[i]!] === this.player && this.sim.prod.has(bs[i]!)) return bs[i]!;
    return -1;
  }

  /** Строить можно в любой момент: заказ уходит в свою базу, выделять её не нужно. */
  produce(def: number): void {
    const b = this.base();
    if (b < 0) return;
    const d = this.reg.units[def]!;
    const p = this.sim.prod.get(b)!;
    if (this.sim.players[this.player]!.metal < d.raw.cost || p.queue.length >= this.reg.game.economy.queueMax) { this.fb.denied(); return; }
    enqueue(this.sim, { type: 'produce', player: this.player, building: b, def });
    this.fb.ack();
  }

  cancel(): void {
    const b = this.base();
    if (b >= 0) enqueue(this.sim, { type: 'cancel', player: this.player, building: b });
  }

  assignGroup(n: number): void {
    this.groups.set(n, this.mine());
  }

  recallGroup(n: number, add: boolean): number[] {
    const g = (this.groups.get(n) ?? []).filter((e) => entityExists(this.sim.ecs, e) && hasComponent(this.sim.ecs, Unit, e) && this.own(e));
    this.groups.set(n, g);
    if (!add) this.selection.clear();
    for (const e of g) this.selection.add(e);
    return g;
  }
}
