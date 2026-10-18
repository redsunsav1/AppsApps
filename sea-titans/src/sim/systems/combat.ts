import { entityExists, hasComponent } from 'bitecs';
import { ONE, fatan2, fcos, fsin, length } from '../../core/fixed';
import { Building, Facing, Health, Mover, Owner, Position, Unit, Weapon } from '../components';
import { lineClear } from '../path/los';
import { emit, weaponQuery, type SimWorld } from '../world';

const alive = (w: SimWorld, e: number): boolean => e >= 0 && entityExists(w.ecs, e) && hasComponent(w.ecs, Health, e) && !w.dead.has(e);

/**
 * Выбор целей и стрельба. Свободные, атакующие-в-движении и патрульные юниты сами ищут ближайшего
 * врага в радиусе обзора; при обычном движении юниты не отвлекаются (классика RTS).
 */
export function combatSystem(w: SimWorld): void {
  const cfg = w.reg.game.combat;
  const ents = weaponQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    const def = w.reg.units[Unit.def[e]!]!;
    const wp = def.weapon!;
    if (Weapon.cd[e]! > 0) Weapon.cd[e]!--;
    Weapon.engaged[e] = 0;

    const head = w.orders.get(e)?.[0];
    let tgt = -1;
    let auto = false;
    if (head?.type === 'attack') {
      tgt = alive(w, head.tgt) ? head.tgt : -1;
    } else if (!head || head.type === 'amove' || head.type === 'patrol') {
      auto = true;
      tgt = Weapon.target[e]!;
      const sid = Unit.sid[e]!;
      if (!alive(w, tgt) || Owner.player[tgt] === Owner.player[e] || distTo(e, tgt) > def.sight || (w.tick + sid) % cfg.retargetInterval === 0) {
        tgt = nearestEnemy(w, e, def.sight);
      }
    }
    Weapon.target[e] = tgt;
    if (tgt < 0) continue;

    const dx = Position.x[tgt]! - Position.x[e]!;
    const dy = Position.y[tgt]! - Position.y[e]!;
    const edge = length(dx, dy) - Mover.radius[tgt]!;
    // за скалой не стреляем и не гонимся по прямой: при атаке-движении продолжаем путь,
    // при приказе атаки навигация сама обойдёт препятствие
    if (!lineClear(w.grid, Position.x[e]!, Position.y[e]!, Position.x[tgt]!, Position.y[tgt]!)) {
      if (auto) Weapon.target[e] = -1;
      continue;
    }
    if (edge <= wp.range) {
      Weapon.engaged[e] = 1;
      w.wantX.delete(e); w.wantY.delete(e); w.wantSpeed.delete(e);
      if (Mover.speed[e]! > 0) Facing.angle[e] = fatan2(dy, dx);
      if (Weapon.cd[e] === 0) fire(w, e, tgt, wp);
    } else if (auto && Mover.speed[e]! > 0 && !Mover.hold[e] && edge <= def.sight) {
      // погоня за целью в пределах обзора
      Weapon.engaged[e] = 1;
      w.wantX.set(e, dx); w.wantY.set(e, dy); w.wantSpeed.set(e, Mover.speed[e]!);
    }
  }
}


function distTo(a: number, b: number): number {
  return length(Position.x[b]! - Position.x[a]!, Position.y[b]! - Position.y[a]!);
}

/** Ближайший враг в радиусе; боевые юниты важнее сборщиков и зданий на той же дистанции (+2 тайла форы). */
export function nearestEnemy(w: SimWorld, e: number, radius: number): number {
  const me = Owner.player[e]!;
  const x = Position.x[e]!, y = Position.y[e]!;
  let best = -1, bestScore = Infinity, bestSid = 0;
  w.spatial.query(x, y, radius, (o) => {
    if (Owner.player[o] === me || w.dead.has(o) || !entityExists(w.ecs, o)) return;
    const d = length(Position.x[o]! - x, Position.y[o]! - y) - Mover.radius[o]!;
    if (d > radius) return;
    if (!lineClear(w.grid, x, y, Position.x[o]!, Position.y[o]!)) return;
    const armed = hasComponent(w.ecs, Weapon, o) && !hasComponent(w.ecs, Building, o);
    const score = d + (armed ? 0 : 2 * ONE);
    const sid = Unit.sid[o]!;
    if (score < bestScore || (score === bestScore && sid < bestSid)) { bestScore = score; best = o; bestSid = sid; }
  });
  return best;
}

function fire(w: SimWorld, e: number, tgt: number, wp: NonNullable<SimWorld['reg']['units'][number]['weapon']>): void {
  const a = Facing.angle[e]!;
  const r = Mover.radius[e]!;
  const sx = Mover.speed[e]! > 0 ? Position.x[e]! + Math.trunc((fcos(a) * r) / ONE) : Position.x[e]!;
  const sy = Mover.speed[e]! > 0 ? Position.y[e]! + Math.trunc((fsin(a) * r) / ONE) : Position.y[e]!;
  w.projectiles.push({
    x: sx, y: sy, tx: Position.x[tgt]!, ty: Position.y[tgt]!, tgt,
    speed: wp.speed, damage: wp.damage, splash: wp.splash, owner: Owner.player[e]!, kind: wp.kind,
    ttl: w.reg.game.combat.projectileMaxTicks, homing: wp.splash === 0,
  });
  Weapon.cd[e] = wp.cooldown;
  emit(w, { t: 'shot', x: sx, y: sy, kind: wp.kind, owner: Owner.player[e]! });
}

/** Полёт снарядов: самонаводящиеся торпеды и пули, снаряды крейсера бьют в точку по площади, скалы их гасят. */
export function projectileSystem(w: SimWorld): void {
  const list = w.projectiles;
  let k = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i]!;
    if (p.homing && alive(w, p.tgt)) { p.tx = Position.x[p.tgt]!; p.ty = Position.y[p.tgt]!; }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = length(dx, dy);
    let impact = false;
    if (d <= p.speed) { p.x = p.tx; p.y = p.ty; impact = true; }
    else {
      p.x += Math.trunc((dx * p.speed) / d);
      p.y += Math.trunc((dy * p.speed) / d);
      if (w.grid.isBlocked(p.x >> 10, p.y >> 10)) impact = true;
    }
    if (--p.ttl <= 0) impact = true;
    if (impact) { explode(w, p); continue; }
    list[k++] = p;
  }
  list.length = k;
}

function explode(w: SimWorld, p: SimWorld['projectiles'][number]): void {
  emit(w, { t: 'hit', x: p.x, y: p.y, kind: p.kind, splash: p.splash });
  if (p.splash > 0) {
    w.spatial.query(p.x, p.y, p.splash + ONE, (o) => {
      if (Owner.player[o] === p.owner || !alive(w, o)) return;
      if (length(Position.x[o]! - p.x, Position.y[o]! - p.y) <= p.splash + Mover.radius[o]!) damage(w, o, p.damage);
    });
  } else if (alive(w, p.tgt) && length(Position.x[p.tgt]! - p.x, Position.y[p.tgt]! - p.y) <= Mover.radius[p.tgt]! + (ONE >> 2)) {
    damage(w, p.tgt, p.damage);
  }
}

export function damage(w: SimWorld, e: number, amount: number): void {
  const dmg = Math.max(w.reg.game.combat.minDamage, amount - Health.armor[e]!);
  Health.hp[e]! -= dmg;
  const owner = Owner.player[e]!;
  const ps = w.players[owner];
  if (ps && w.tick - ps.lastAlert > w.reg.game.tickRate * 10) {
    ps.lastAlert = w.tick;
    emit(w, { t: 'alert', owner, x: Position.x[e]!, y: Position.y[e]! });
  }
  if (Health.hp[e]! <= 0) w.dead.add(e);
}
