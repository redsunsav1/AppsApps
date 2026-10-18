import { addComponent, addEntity, createWorld, defineQuery, removeEntity, type IWorld } from 'bitecs';
import { Rng } from '../core/rng';
import type { Registry } from '../data/registry';
import type { MapGrid } from './map/grid';
import { AStar } from './path/astar';
import { FlowFieldCache } from './path/flowfield';
import { SpatialHash } from './spatial';
import { Facing, Health, Mover, Owner, Position, Selectable, Unit, Velocity } from './components';
import type { Command } from './commands';

export type OrderType = 'move' | 'amove' | 'patrol';

/** Приказ в очереди юнита. x/y — слот формации, gx/gy — общая цель группы. */
export interface Order {
  type: OrderType;
  x: number; y: number;
  gx: number; gy: number;
  groupSize: number;
  /** Для патруля — вторая точка маршрута. */
  ox: number; oy: number;
}

export const NAV_DIRECT = 0;
export const NAV_PATH = 1;
export const NAV_FLOW = 2;

/** Состояние навигации по активному приказу. */
export interface Nav {
  mode: number;
  pts: number[];      // fixed-точки пути для NAV_PATH
  wp: number;
  flowGoal: number;   // клетка-цель поля для NAV_FLOW
  best: number;       // лучшая достигнутая дистанция до слота
  stuck: number;
  repathed: boolean;
}

export interface SimWorld {
  ecs: IWorld;
  reg: Registry;
  grid: MapGrid;
  tick: number;
  rng: Rng;
  nextSid: number;
  orders: Map<number, Order[]>;
  nav: Map<number, Nav>;
  astar: AStar;
  flow: FlowFieldCache;
  spatial: SpatialHash;
  pending: Command[];
  /** Буфер намерений steering → movement (fixed-вектор желаемого направления и скорость). */
  wantX: Map<number, number>;
  wantY: Map<number, number>;
  wantSpeed: Map<number, number>;
}

export const unitQuery = defineQuery([Position, Facing, Unit, Owner, Mover]);

export function createSimWorld(reg: Registry, grid: MapGrid, seed: number): SimWorld {
  return {
    ecs: createWorld(),
    reg,
    grid,
    tick: 0,
    rng: new Rng(seed),
    nextSid: 1,
    orders: new Map(),
    nav: new Map(),
    astar: new AStar(grid, reg.game.movement.astarMaxNodes),
    flow: new FlowFieldCache(grid),
    spatial: new SpatialHash(grid.width, grid.h),
    pending: [],
    wantX: new Map(),
    wantY: new Map(),
    wantSpeed: new Map(),
  };
}

export function spawnUnit(w: SimWorld, defId: string, player: number, x: number, y: number, angle = 0): number {
  const def = w.reg.unitById.get(defId);
  if (!def) throw new Error(`Неизвестный юнит ${defId}`);
  const eid = addEntity(w.ecs);
  for (const c of [Position, Velocity, Facing, Owner, Unit, Health, Mover, Selectable]) addComponent(w.ecs, c, eid);
  Position.x[eid] = Position.px[eid] = x;
  Position.y[eid] = Position.py[eid] = y;
  Velocity.x[eid] = Velocity.y[eid] = 0;
  Facing.angle[eid] = Facing.prev[eid] = angle & 0xffff;
  Owner.player[eid] = player;
  Unit.def[eid] = def.index;
  Unit.sid[eid] = w.nextSid++;
  Health.hp[eid] = Health.maxHp[eid] = def.raw.hp;
  Mover.speed[eid] = def.speed;
  Mover.turnRate[eid] = def.turnRate;
  Mover.radius[eid] = def.radius;
  Mover.layer[eid] = def.layer;
  Mover.cur[eid] = 0;
  Mover.hold[eid] = 0;
  Mover.cls[eid] = def.sizeClass;
  w.orders.set(eid, []);
  return eid;
}

export function despawn(w: SimWorld, eid: number): void {
  w.orders.delete(eid);
  w.nav.delete(eid);
  removeEntity(w.ecs, eid);
}

/** Поставить команду в очередь — она применится в начале следующего тика. */
export function enqueue(w: SimWorld, cmd: Command): void {
  w.pending.push(cmd);
}
