import { hasComponent } from 'bitecs';
import type { Registry } from '../data/registry';
import { Building, Facing, Harvester, Health, Mover, Owner, Position, ResourceNode, Unit } from '../sim/components';
import { nodeQuery, unitQuery, type SimWorld } from '../sim/world';
import type { Fog } from './fog';
import type { Fx } from './fx';
import { hash3, makeCanvas, type RGB } from './pixel';
import type { Sprites } from './sprites';

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** fixed (1 тайл = 1024) → пиксели мира при тайле 16 px. */
export const FX_TO_PX = 1024 / 16;

export interface Pick { e: number; x: number; y: number; r: number }
interface Marker { x: number; y: number; t: number; color: RGB }

/**
 * Отрисовка в низком разрешении: буфер ~480 px по ширине, растянутый целым масштабом
 * без сглаживания. Камера и всё остальное — в целых пикселях.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  scale = 3;
  bw = 480;
  bh = 270;
  camX = 0;
  camY = 0;
  insetTop = 0;
  insetBottom = 0;
  picks: Pick[] = [];
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private markers: Marker[] = [];
  private time = 0;
  private readonly fogDither: HTMLCanvasElement;
  private readonly black: HTMLCanvasElement;
  private readonly shadows = new Map<number, HTMLCanvasElement>();
  private readonly snow = Array.from({ length: 80 }, () => ({ x: Math.random() * 2000, y: Math.random() * 2000, d: 0.3 + Math.random() * 0.6 }));
  private readonly T: number;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly reg: Registry,
    private readonly sprites: Sprites,
    private readonly map: HTMLCanvasElement,
    private readonly fog: Fog,
    private readonly fx: Fx,
    readonly player: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.T = reg.palette.tile;
    const [d, dctx] = makeCanvas(this.T, this.T);
    dctx.fillStyle = '#000';
    for (let y = 0; y < this.T; y++) for (let x = 0; x < this.T; x++) if ((x + y) % 2 === 0) dctx.fillRect(x, y, 1, 1);
    this.fogDither = d;
    const [b, bctx] = makeCanvas(this.T, this.T);
    bctx.fillStyle = '#000';
    bctx.fillRect(0, 0, this.T, this.T);
    this.black = b;
  }

  resize(insetTopCss: number, insetBottomCss: number): void {
    const W = window.innerWidth, H = window.innerHeight;
    this.scale = Math.max(1, Math.round(W / this.reg.game.camera.targetWidth));
    this.bw = Math.ceil(W / this.scale);
    this.bh = Math.ceil(H / this.scale);
    this.canvas.width = this.bw;
    this.canvas.height = this.bh;
    this.canvas.style.width = `${this.bw * this.scale}px`;
    this.canvas.style.height = `${this.bh * this.scale}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.insetTop = Math.ceil(insetTopCss / this.scale);
    this.insetBottom = Math.ceil(insetBottomCss / this.scale);
    this.clamp();
  }

  toWorld(clientX: number, clientY: number): [number, number] {
    return [clientX / this.scale + this.camX, clientY / this.scale + this.camY];
  }

  toBuffer(clientX: number, clientY: number): [number, number] {
    return [clientX / this.scale, clientY / this.scale];
  }

  pan(dx: number, dy: number): void {
    this.camX += dx;
    this.camY += dy;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.camX = wx - this.bw / 2;
    this.camY = wy - (this.bh - this.insetBottom + this.insetTop) / 2;
    this.clamp();
  }

  marker(wx: number, wy: number, color: RGB): void {
    this.markers.push({ x: wx, y: wy, t: 0, color });
  }

  private clamp(): void {
    const mw = this.map.width, mh = this.map.height;
    this.camX = Math.max(-16, Math.min(mw - this.bw + 16, this.camX));
    this.camY = Math.max(-this.insetTop - 8, Math.min(mh - this.bh + this.insetBottom + 8, this.camY));
  }

  draw(sim: SimWorld, alpha: number, dt: number, selection: Set<number>): void {
    this.time += dt;
    const ctx = this.ctx;
    const C = this.sprites.colors;
    const T = this.T;
    const [sx, sy] = this.fx.offset();
    const ox = Math.round(this.camX) + sx, oy = Math.round(this.camY) + sy;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.bw, this.bh);
    ctx.drawImage(this.map, -ox, -oy);

    const tx0 = Math.max(0, Math.floor(ox / T)), ty0 = Math.max(0, Math.floor(oy / T));
    const tx1 = Math.min(sim.grid.width - 1, Math.floor((ox + this.bw) / T)), ty1 = Math.min(sim.grid.h - 1, Math.floor((oy + this.bh) / T));

    // блики на воде: пиксели «мерцают» по фазе из хэша клетки
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (sim.grid.blocked[sim.grid.idx(tx, ty)]) continue;
      for (let k = 0; k < 2; k++) {
        const ph = Math.floor(this.time * 3 + hash3(tx, ty, k + 11) * 8) % 8;
        if (ph > 1) continue;
        const px = tx * T + Math.floor(hash3(tx, ty, k) * (T - 3)) - ox, py = ty * T + Math.floor(hash3(ty, tx, k) * T) - oy;
        ctx.fillStyle = css(ph === 0 ? C.glint! : C.foam!);
        ctx.fillRect(px, py, ph === 0 ? 3 : 1, 1);
      }
    }

    // месторождения
    const nodes = nodeQuery(sim.ecs);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const wx = Position.x[n]! / FX_TO_PX, wy = Position.y[n]! / FX_TO_PX;
      if (!this.fog.isExplored(wx / T, wy / T)) continue;
      const k = ResourceNode.amount[n]! / ResourceNode.max[n]!;
      const spr = this.sprites.crystals[k > 0.66 ? 2 : k > 0.33 ? 1 : 0]!;
      ctx.drawImage(spr, Math.round(wx - 8 - ox), Math.round(wy - 8 - oy));
      if (Math.floor(this.time * 2 + n) % 5 === 0) { ctx.fillStyle = css(C.white!); ctx.fillRect(Math.round(wx - 2 - ox + (n % 5)), Math.round(wy - 4 - oy), 1, 1); }
    }

    // юниты: сначала тени, потом корпуса по y
    const ents = unitQuery(sim.ecs);
    const list: { e: number; x: number; y: number }[] = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const x = (Position.px[e]! + (Position.x[e]! - Position.px[e]!) * alpha) / FX_TO_PX;
      const y = (Position.py[e]! + (Position.y[e]! - Position.py[e]!) * alpha) / FX_TO_PX;
      if (Owner.player[e] !== this.player && !this.fog.isVisible(x / T, y / T)) continue;
      if (x < ox - 32 || y < oy - 32 || x > ox + this.bw + 32 || y > oy + this.bh + 32) continue;
      list.push({ e, x, y });
    }
    list.sort((a, b) => a.y - b.y || a.e - b.e);
    this.picks = [];
    for (const { e, x, y } of list) {
      const def = this.reg.units[Unit.def[e]!]!;
      const set = this.sprites.units.get(def.raw.sprite)!;
      const lift = [1, 3, 5][Mover.layer[e]!]!;
      const sh = this.shadow(set.size);
      ctx.drawImage(sh, Math.round(x - sh.width / 2 - ox + lift), Math.round(y - sh.height / 2 - oy + lift + 1));
    }
    for (const { e, x, y } of list) {
      const def = this.reg.units[Unit.def[e]!]!;
      const set = this.sprites.units.get(def.raw.sprite)!;
      const team = Owner.player[e]!;
      const building = hasComponent(sim.ecs, Building, e);
      const dirs = set.frames[team]!;
      const dir = building ? 0 : Math.round(Facing.angle[e]! / 8192) & 7;
      const moving = Position.x[e] !== Position.px[e] || Position.y[e] !== Position.py[e];
      const mining = hasComponent(sim.ecs, Harvester, e) && Harvester.state[e] === 2;
      const anim = building ? Math.floor(this.time * 2) % 2 : (moving || mining) ? Math.floor(this.time * 8 + e) % 2 : 0;
      const bob = Mover.layer[e]! > 0 && !building ? Math.round(Math.sin(this.time * 2.5 + e) * 0.6) : 0;
      const spr = dirs[dir]![anim]!;
      const dx = Math.round(x - set.size / 2 - ox), dy = Math.round(y - set.size / 2 - oy) + bob;
      ctx.drawImage(spr, dx, dy);
      this.picks.push({ e, x, y, r: set.size * 0.45 });
      if (moving && !building && Math.random() < 0.25) {
        const a = Facing.angle[e]! / 65536 * Math.PI * 2;
        this.fx.trail(x - Math.cos(a) * set.size * 0.45, y - Math.sin(a) * set.size * 0.45);
      }
      const sel = selection.has(e);
      if (sel) this.brackets(dx - 1, dy - 1, set.size + 2, team === this.player ? C.select! : C.hpLow!);
      if (sel || Health.hp[e]! < Health.maxHp[e]!) this.hpBar(Math.round(x - ox), dy - 3, Math.max(8, Math.round(set.size * 0.7)), Health.hp[e]! / Health.maxHp[e]!);
      if (sel && building && team === this.player) this.rally(sim, e, x - ox, y - oy);
    }

    // снаряды
    for (const p of sim.projectiles) {
      const x = p.x / FX_TO_PX, y = p.y / FX_TO_PX;
      if (!this.fog.isVisible(x / T, y / T)) continue;
      const px = Math.round(x - ox), py = Math.round(y - oy);
      const team = this.sprites.teams[p.owner] ?? this.sprites.teams[0]!;
      if (p.kind === 0) { ctx.fillStyle = css(C.white!); ctx.fillRect(px, py, 2, 2); ctx.fillStyle = css(team.main); ctx.fillRect(px - 1, py, 1, 1); }
      else if (p.kind === 1) {
        const a = Math.atan2(p.ty - p.y, p.tx - p.x);
        ctx.fillStyle = css(C.white!);
        for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(px - Math.cos(a) * k), Math.round(py - Math.sin(a) * k), 1, 1);
        if (Math.random() < 0.6) this.fx.trail(x - Math.cos(a) * 4, y - Math.sin(a) * 4);
      } else { ctx.fillStyle = css(C.ink!); ctx.fillRect(px - 2, py - 2, 5, 5); ctx.fillStyle = css(C.ember!); ctx.fillRect(px - 1, py - 1, 3, 3); }
    }

    this.fx.draw(ctx, ox, oy);
    this.drawSnow(ox, oy);

    // туман войны
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const i = ty * sim.grid.width + tx;
      if (!this.fog.explored[i]) ctx.drawImage(this.black, tx * T - ox, ty * T - oy);
      else if (!this.fog.visible[i]) ctx.drawImage(this.fogDither, tx * T - ox, ty * T - oy);
    }

    // маркеры приказов
    this.markers = this.markers.filter((m) => (m.t += dt) < 0.5);
    for (const m of this.markers) {
      const s = Math.round(5 - m.t * 8);
      ctx.fillStyle = css(m.color);
      const x = Math.round(m.x - ox), y = Math.round(m.y - oy);
      for (let k = -s; k <= s; k++) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + k, y - k, 1, 1); }
    }

    if (this.box) {
      const b = this.box;
      const x = Math.round(Math.min(b.x0, b.x1)), y = Math.round(Math.min(b.y0, b.y1));
      const w = Math.round(Math.abs(b.x1 - b.x0)), h = Math.round(Math.abs(b.y1 - b.y0));
      ctx.fillStyle = css(C.select!);
      ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h, w + 1, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w, y, 1, h);
    }
  }

  private drawSnow(ox: number, oy: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = css(this.sprites.colors.foam!);
    for (const s of this.snow) {
      s.y += 0.08 * s.d;
      s.x += Math.sin(this.time + s.d * 10) * 0.03;
      const x = ((s.x - ox * s.d) % this.bw + this.bw) % this.bw;
      const y = ((s.y - oy * s.d) % this.bh + this.bh) % this.bh;
      if (s.d > 0.6 || (Math.floor(x) + Math.floor(y)) % 2 === 0) ctx.fillRect(Math.floor(x), Math.floor(y), 1, 1);
    }
  }

  private shadow(size: number): HTMLCanvasElement {
    let s = this.shadows.get(size);
    if (s) return s;
    const w = Math.round(size * 0.8), h = Math.round(size * 0.5);
    const [c, ctx] = makeCanvas(w, h);
    ctx.fillStyle = '#000814';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
      if (dx * dx + dy * dy <= 1 && (x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
    }
    this.shadows.set(size, c);
    s = c;
    return s;
  }

  private brackets(x: number, y: number, s: number, c: RGB): void {
    const ctx = this.ctx;
    ctx.fillStyle = css(c);
    const l = Math.max(2, Math.floor(s / 4));
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + s, y, -1, 1], [x, y + s, 1, -1], [x + s, y + s, -1, -1]] as const) {
      ctx.fillRect(dx > 0 ? cx : cx - l + 1, cy, l, 1);
      ctx.fillRect(cx, dy > 0 ? cy : cy - l + 1, 1, l);
    }
  }

  private hpBar(cx: number, y: number, w: number, k: number): void {
    const C = this.sprites.colors;
    const ctx = this.ctx;
    const x = cx - Math.floor(w / 2);
    ctx.fillStyle = css(C.ink!);
    ctx.fillRect(x - 1, y - 1, w + 2, 3);
    ctx.fillStyle = css(k > 0.6 ? C.select! : k > 0.3 ? C.hpMid! : C.hpLow!);
    ctx.fillRect(x, y, Math.max(1, Math.round(w * k)), 1);
  }

  private rally(sim: SimWorld, b: number, bx: number, by: number): void {
    const p = sim.prod.get(b);
    if (!p || (p.rallyX === Position.x[b] && p.rallyY === Position.y[b])) return;
    const ctx = this.ctx;
    const rx = p.rallyX / FX_TO_PX - this.camX, ry = p.rallyY / FX_TO_PX - this.camY;
    const n = Math.max(1, Math.floor(Math.hypot(rx - bx, ry - by) / 3));
    ctx.fillStyle = css(this.sprites.colors.select!);
    for (let k = 0; k < n; k += 2) ctx.fillRect(Math.round(bx + ((rx - bx) * k) / n), Math.round(by + ((ry - by) * k) / n), 1, 1);
    ctx.fillRect(Math.round(rx), Math.round(ry) - 6, 1, 7);
    ctx.fillStyle = css(this.sprites.teams[this.player]!.main);
    ctx.fillRect(Math.round(rx) + 1, Math.round(ry) - 6, 4, 3);
  }
}

export const isBuilding = (sim: SimWorld, e: number): boolean => hasComponent(sim.ecs, Building, e);
