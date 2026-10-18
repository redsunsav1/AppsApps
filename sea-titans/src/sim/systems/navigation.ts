import { HALF, length, toFixed } from '../../core/fixed';
import { DX8, DY8, cellCenter, cellCoord } from '../map/grid';
import { octile, smoothPath } from '../path/astar';
import { NO_DIR, type FlowField } from '../path/flowfield';
import { lineClearThick } from '../path/los';
import { Mover, Position, Unit } from '../components';
import { NAV_DIRECT, NAV_FLOW, NAV_PATH, unitQuery, type Nav, type Order, type SimWorld } from '../world';

/**
 * Для каждого юнита с приказом вычисляет «куда сейчас хочу» (wantX/wantY + wantSpeed).
 * Выбор способа: прямая видимость → напрямую; большая группа → flow field; иначе A*.
 */
export function navigationSystem(w: SimWorld): void {
  const m = w.reg.game.movement;
  const arrive = toFixed(m.arriveDistance);
  const slowR = toFixed(m.slowRadius);
  const finishDist = toFixed(m.stuckFinishDistance);
  const flowDirect = toFixed(m.flowToDirectDistance);
  w.wantX.clear(); w.wantY.clear(); w.wantSpeed.clear();

  const ents = unitQuery(w.ecs);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]!;
    const q = w.orders.get(e);
    if (!q || q.length === 0) continue;
    const order = q[0]!;
    let nav = w.nav.get(e);
    if (!nav) { nav = plan(w, e, order); w.nav.set(e, nav); }

    const x = Position.x[e]!, y = Position.y[e]!;
    let field: FlowField | null = null;
    if (nav.mode === NAV_FLOW) {
      const cls = Mover.cls[e]!;
      field = w.flow.tryGet(nav.flowGoal, w.tick, cls, m.flowFieldsPerTick);
      if (!field) continue; // поле строится в следующих тиках — ждём, не считая это застреванием
      if (!field.reachable(w.grid.idx(cellCoord(x, cls), cellCoord(y, cls)))) {
        nav = planPath(w, e, order);
        w.nav.set(e, nav);
        field = null;
      }
    }
    const d = length(order.x - x, order.y - y);

    // прогресс и застревание
    if (d < nav.best - (Mover.speed[e]! >> 2)) { nav.best = d; nav.stuck = 0; } else nav.stuck++;
    const groupSpread = order.groupSize > 1 ? finishDist + (isqrtGroup(order.groupSize) * Mover.radius[e]!) : finishDist >> 1;
    if (d <= arrive || (nav.stuck > m.stuckFinishTicks && d < groupSpread) || nav.stuck > m.stuckGiveUpTicks) {
      finishOrder(w, e, q);
      continue;
    }
    if (nav.stuck === m.stuckRepathTicks && !nav.repathed) {
      const fresh = planPath(w, e, order);
      fresh.repathed = true;
      w.nav.set(e, fresh);
      nav = fresh;
    }

    const sid = Unit.sid[e]!;
    const r = Mover.radius[e]!;
    let tx = order.x, ty = order.y;
    let final = true;

    if (nav.mode === NAV_PATH) {
      // переход к следующей точке, если близко или она уже видна
      while (nav.wp < nav.pts.length / 2 - 1) {
        const px = nav.pts[nav.wp * 2]!, py = nav.pts[nav.wp * 2 + 1]!;
        const nx = nav.pts[nav.wp * 2 + 2]!, ny = nav.pts[nav.wp * 2 + 3]!;
        if (length(px - x, py - y) < HALF || ((w.tick + sid) % m.losCheckInterval === 0 && lineClearThick(w.grid, x, y, nx, ny, r))) nav.wp++;
        else break;
      }
      if (nav.wp >= nav.pts.length / 2 - 1) {
        // последняя точка пути — это клетка слота, дальше напрямую
        if (lineClearThick(w.grid, x, y, order.x, order.y, r) || nav.pts.length === 0) nav.mode = NAV_DIRECT;
        else { tx = nav.pts[nav.pts.length - 2]!; ty = nav.pts[nav.pts.length - 1]!; final = false; }
      } else {
        tx = nav.pts[nav.wp * 2]!; ty = nav.pts[nav.wp * 2 + 1]!; final = false;
      }
    } else if (nav.mode === NAV_FLOW) {
      if ((w.tick + sid) % m.losCheckInterval === 0 && d < flowDirect && lineClearThick(w.grid, x, y, order.x, order.y, r)) {
        nav.mode = NAV_DIRECT;
      } else {
        const cls = Mover.cls[e]!;
        let cx = cellCoord(x, cls), cy = cellCoord(y, cls);
        // смотрим на 2 клетки вперёд по полю — путь получается плавнее
        let steps = 0;
        for (; steps < 2; steps++) {
          const dir = field!.dir[cy * w.grid.width + cx]!;
          if (dir === NO_DIR) break;
          cx += DX8[dir]!; cy += DY8[dir]!;
        }
        if (steps === 0) nav.mode = NAV_DIRECT;
        else { tx = cellCenter(cx, cls); ty = cellCenter(cy, cls); final = false; }
      }
    }

    const dx = tx - x, dy = ty - y;
    w.wantX.set(e, dx);
    w.wantY.set(e, dy);
    let speed = Mover.speed[e]!;
    if (final && d < slowR) speed = Math.max(speed >> 2, Math.trunc((speed * d) / slowR));
    w.wantSpeed.set(e, speed);
  }
}

const isqrtGroup = (n: number): number => Math.ceil(Math.sqrt(n));

function finishOrder(w: SimWorld, e: number, q: Order[]): void {
  const done = q.shift()!;
  w.nav.delete(e);
  if (done.type === 'patrol') {
    // обратный путь патруля идёт A*, у группы нет общей цели
    q.push({ ...done, x: done.ox, y: done.oy, ox: done.x, oy: done.y, gx: done.ox, gy: done.oy, groupSize: 1 });
  }
}

function plan(w: SimWorld, e: number, order: Order): Nav {
  const x = Position.x[e]!, y = Position.y[e]!;
  const base: Nav = { mode: NAV_DIRECT, pts: [], wp: 0, flowGoal: -1, best: length(order.x - x, order.y - y), stuck: 0, repathed: false };
  if (lineClearThick(w.grid, x, y, order.x, order.y, Mover.radius[e]!)) return base;
  if (order.groupSize >= w.reg.game.movement.flowFieldMinGroup) {
    const cls = Mover.cls[e]!;
    const goal = w.grid.nearestPassable(cellCoord(order.gx, cls), cellCoord(order.gy, cls), 32, cls);
    // достижимость проверяется, когда поле будет построено (см. бюджет flowFieldsPerTick)
    if (goal >= 0) return { ...base, mode: NAV_FLOW, flowGoal: goal };
  }
  return planPath(w, e, order);
}

function planPath(w: SimWorld, e: number, order: Order): Nav {
  const grid = w.grid;
  const x = Position.x[e]!, y = Position.y[e]!;
  const nav: Nav = { mode: NAV_DIRECT, pts: [], wp: 0, flowGoal: -1, best: length(order.x - x, order.y - y), stuck: 0, repathed: false };
  const cls = Mover.cls[e]!;
  const sx = cellCoord(x, cls), sy = cellCoord(y, cls);
  let start = grid.inBounds(sx, sy) ? grid.idx(sx, sy) : -1;
  if (start < 0 || grid.blockedFor(cls)[start]) start = grid.nearestPassable(sx, sy, 32, cls);
  const goal = grid.nearestPassable(cellCoord(order.x, cls), cellCoord(order.y, cls), 32, cls);
  if (start < 0 || goal < 0) return nav;
  let cells = w.astar.find(start, goal, cls);
  if (!cells) {
    // цель недостижима для этого класса — едем к ближайшей достижимой клетке
    const near = closestReachable(w, start, goal, cls);
    if (near < 0 || near === start) { nav.stuck = w.reg.game.movement.stuckGiveUpTicks + 1; return nav; }
    cells = w.astar.find(start, near, cls);
    if (!cells) { nav.stuck = w.reg.game.movement.stuckGiveUpTicks + 1; return nav; }
  }
  nav.pts = smoothPath(grid, cells, x, y, Mover.radius[e]!, cls);
  nav.mode = NAV_PATH;
  return nav;
}


function closestReachable(w: SimWorld, start: number, goal: number, cls: number): number {
  const grid = w.grid;
  const gw = grid.width;
  const reach = grid.floodFill(start % gw, (start / gw) | 0, cls);
  const gx = goal % gw, gy = (goal / gw) | 0;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < reach.length; i++) {
    if (!reach[i]) continue;
    const d = octile(i % gw, (i / gw) | 0, gx, gy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
