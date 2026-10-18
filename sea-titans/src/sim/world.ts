import { addComponent, addEntity, createWorld, defineQuery, removeEntity, type IWorld } from 'bitecs';
import { Rng } from '../core/rng';
import type { Registry } from '../data/registry';
import type { MapGrid } from './map/grid';
import { AStar } from './path/astar';
import { FlowFieldCache } from './path/flowfield';
import { SpatialHash } from './spatial';
import {
  Building, Facing, Harvester, Health, Mover, Owner, Position, ResourceNode, Selectable, Unit, Velocity, Weapon,
} from './components';
import type { Command } from './commands';

export type OrderType = 'move' | 'amove' | 'patrol' | 'attack';

/** Приказ в очереди юнита. x/y — слот формации, gx/gy — общая цель группы. */
export interface Order {
  type: OrderType;
  x: number; y: number;
  gx: number; gy: number;
  groupSize: number;
  /** Для патруля — вторая точка маршрута. */
  ox: number; oy: number;
  /** Для атаки — eid цели. */
  tgt: number;
}

export const NAV_DIRECT = 0;
export const NAV_PATH = 1;
export const NAV_FLOW = 2;

export interface Nav {
  mode: number;
  pts: number[];
  wp: number;
  flowGoal: number;
  best: number;
  stuck: number;
  repathed: boolean;
  planned: number;
  /** Позиция на прошлом тике — для оценки застревания на маршруте. */
  lx: number;
  ly: number;
}

export interface Projectile {
  x: number; y: number;
  tx: number; ty: number;
  tgt: number;
  speed: number;
  damage: number;
  splash: number;
  owner: number;
  kind: number;
  ttl: number;
  homing: boolean;
}

export interface Producer {
  queue: number[];
  progress: number;
  rallyX: number;
  rallyY: number;
}

export interface PlayerState {
  metal: number;
  alive: boolean;
  ai: boolean;
  /** Для ИИ: размер следующей волны. */
  wave: number;
  lastAlert: number;
}

/** События для рендера и звука. Симуляция их только пишет. */
export type SimEvent =
  | { t: 'shot'; x: number; y: number; kind: number; owner: number }
  | { t: 'hit'; x: number; y: number; kind: number; splash: number }
  | { t: 'death'; x: number; y: number; r: number; owner: number; building: boolean }
  | { t: 'built'; owner: number; def: number }
  | { t: 'deposit'; owner: number; amount: number }
  | { t: 'alert'; owner: number; x: number; y: number }
  | { t: 'win'; player: number };

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
  wantX: Map<number, number>;
  wantY: Map<number, number>;
  wantSpeed: Map<number, number>;
  players: PlayerState[];
  projectiles: Projectile[];
  prod: Map<number, Producer>;
  dead: Set<number>;
  events: SimEvent[];
  winner: number;
}

export const unitQuery = defineQuery([Position, Facing, Unit, Owner, Mover]);
export const weaponQuery = defineQuery([Position, Unit, Owner, Weapon]);
export const harvesterQuery = defineQuery([Position, Unit, Owner, Harvester]);
export const buildingQuery = defineQuery([Position, Unit, Owner, Building]);
export const nodeQuery = defineQuery([Position, ResourceNode]);

export function createSimWorld(reg: Registry, grid: MapGrid, seed: number, playerCount = 2): SimWorld {
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
    players: Array.from({ length: playerCount }, () => ({
      metal: reg.game.economy.startMetal, alive: true, ai: false, wave: reg.game.ai.waveStart, lastAlert: -10000,
    })),
    projectiles: [],
    prod: new Map(),
    dead: new Set(),
    events: [],
    winner: -1,
  };
}

export function spawnUnit(w: SimWorld, defId: string | number, player: number, x: number, y: number, angle = 0): number {
  const def = typeof defId === 'number' ? w.reg.units[defId] : w.reg.unitById.get(defId);
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
  Health.armor[eid] = def.raw.armor;
  Mover.speed[eid] = def.speed;
  Mover.radius[eid] = def.radius;
  Mover.layer[eid] = def.layer;
  Mover.hold[eid] = def.speed === 0 ? 1 : 0;
  Mover.cls[eid] = def.sizeClass;
  if (def.weapon) {
    addComponent(w.ecs, Weapon, eid);
    Weapon.cd[eid] = 0;
    Weapon.target[eid] = -1;
    Weapon.engaged[eid] = 0;
  }
  if (def.raw.kind === 'harvester') {
    addComponent(w.ecs, Harvester, eid);
    Harvester.state[eid] = 1;
    Harvester.node[eid] = -1;
    Harvester.carry[eid] = 0;
    Harvester.timer[eid] = 0;
  }
  if (def.raw.kind === 'building') {
    addComponent(w.ecs, Building, eid);
    if (def.produces.length) w.prod.set(eid, { queue: [], progress: 0, rallyX: x, rallyY: y });
  }
  w.orders.set(eid, []);
  return eid;
}

export function spawnNode(w: SimWorld, x: number, y: number, amount: number): number {
  const eid = addEntity(w.ecs);
  addComponent(w.ecs, Position, eid);
  addComponent(w.ecs, ResourceNode, eid);
  Position.x[eid] = Position.px[eid] = x;
  Position.y[eid] = Position.py[eid] = y;
  ResourceNode.amount[eid] = ResourceNode.max[eid] = amount;
  ResourceNode.sid[eid] = w.nextSid++;
  return eid;
}

export function despawn(w: SimWorld, eid: number): void {
  w.orders.delete(eid);
  w.nav.delete(eid);
  w.prod.delete(eid);
  removeEntity(w.ecs, eid);
}

export function enqueue(w: SimWorld, cmd: Command): void {
  w.pending.push(cmd);
}

export function emit(w: SimWorld, ev: SimEvent): void {
  w.events.push(ev);
  // headless-прогоны никто не читает — не копим бесконечно
  if (w.events.length > 4000) w.events.splice(0, 2000);
}
