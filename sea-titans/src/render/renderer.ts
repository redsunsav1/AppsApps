import { entityExists, hasComponent } from 'bitecs';
import type { Registry } from '../data/registry';
import { Building, Facing, Harvester, Health, Mover, Owner, Position, ResourceNode, Unit, Weapon } from '../sim/components';
import { nodeQuery, unitQuery, type SimWorld } from '../sim/world';
import { causticFrames, DecorPainter, lightTexture, rayTexture, type Light } from './env';
import type { Fog } from './fog';
import { Fx, type LightTex } from './fx';
import { makeCanvas, type RGB } from './pixel';
import type { Sprites } from './sprites';
import type { MapArt } from './tiles';

const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
/** fixed (1 тайл = 1024) → пиксели мира при тайле 16 px. */
export const FX_TO_PX = 1024 / 16;

export interface Pick { e: number; x: number; y: number; r: number }
interface Marker { x: number; y: number; t: number; color: RGB }
interface Wreck { img: HTMLCanvasElement; x: number; y: number; t: number }

/**
 * Отрисовка в низком разрешении (~640 px по ширине) с целым масштабом без сглаживания.
 * Пиксельные спрайты + динамический свет, каустики, мягкий туман.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly fx: Fx;
  scale = 2;
  bw = 640;
  bh = 360;
  camX = 0;
  camY = 0;
  insetTop = 0;
  insetBottom = 0;
  picks: Pick[] = [];
  hover = -1;
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private markers: Marker[] = [];
  private wrecks: Wreck[] = [];
  private wreckCache = new Map<string, HTMLCanvasElement>();
  private time = 0;
  private readonly T: number;
  private readonly caustics: HTMLCanvasElement[];
  private readonly ray: HTMLCanvasElement;
  readonly L: LightTex & { team: HTMLCanvasElement[] };
  private readonly decor: DecorPainter;
  private readonly fogCanvas: HTMLCanvasElement;
  private readonly fogCtx: CanvasRenderingContext2D;
  private readonly fogImg: ImageData;
  private readonly shadows = new Map<number, HTMLCanvasElement>();
  private readonly snow = Array.from({ length: 110 }, () => ({ x: Math.random() * 3000, y: Math.random() * 3000, d: 0.3 + Math.random() * 0.7 }));
  private lights: Light[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly reg: Registry,
    readonly sprites: Sprites,
    private readonly art: MapArt,
    private readonly fog: Fog,
    readonly player: number,
    mapW: number, mapH: number,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.T = reg.palette.tile;
    const C = sprites.colors;
    this.L = {
      warm: lightTexture([255, 150, 60]), white: lightTexture([220, 240, 255]), cyan: lightTexture(C.foam!), red: lightTexture([255, 60, 50]),
      team: sprites.teams.map((t) => lightTexture(t.main)),
    };
    this.fx = new Fx(C, this.L);
    this.caustics = causticFrames(C);
    this.ray = rayTexture(C);
    this.decor = new DecorPainter(C);
    [this.fogCanvas, this.fogCtx] = makeCanvas(mapW, mapH);
    this.fogImg = this.fogCtx.createImageData(mapW, mapH);
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

  /** Обломки остаются на дне и медленно тают. */
  addWreck(x: number, y: number, def: number, owner: number, angle: number): void {
    const d = this.reg.units[def]!;
    const set = this.sprites.units.get(d.raw.sprite)!;
    const dir = set.frames[owner]!.length > 1 ? Math.round(angle / 8192) & 7 : 0;
    const key = `${d.raw.sprite}:${owner}:${dir}`;
    let img = this.wreckCache.get(key);
    if (!img) {
      const [c, ctx] = makeCanvas(set.size, set.size);
      ctx.drawImage(set.frames[owner]![dir]![0]!, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(14,12,20,0.72)';
      ctx.fillRect(0, 0, set.size, set.size);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < set.size * 1.5; i++) ctx.fillRect(Math.floor(Math.random() * set.size), Math.floor(Math.random() * set.size), 1 + Math.floor(Math.random() * 2), 1);
      img = c;
      this.wreckCache.set(key, img);
    }
    this.wrecks.push({ img, x, y, t: 0 });
    if (this.wrecks.length > 80) this.wrecks.shift();
  }

  private clamp(): void {
    const mw = this.art.base.width, mh = this.art.base.height;
    this.camX = Math.max(-16, Math.min(mw - this.bw + 16, this.camX));
    this.camY = Math.max(-this.insetTop - 8, Math.min(mh - this.bh + this.insetBottom + 8, this.camY));
  }

  draw(sim: SimWorld, alpha: number, dt: number, selection: Set<number>): void {
    this.time += dt;
    const t = this.time;
    const ctx = this.ctx;
    const C = this.sprites.colors;
    const T = this.T;
    const lights = this.lights;
    lights.length = 0;
    const [shx, shy] = this.fx.offset();
    const ox = Math.round(this.camX) + shx, oy = Math.round(this.camY) + shy;
    const bw = this.bw, bh = this.bh;

    // 1. дно + пульсирующее свечение лавы и биолюминесценции
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, bw, bh);
    ctx.drawImage(this.art.base, -ox, -oy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 2.2);
    ctx.drawImage(this.art.glow, -ox, -oy);
    // 2. каустики — привязаны к дну, медленно «текут»
    const cf = this.caustics[Math.floor(t * 6) % this.caustics.length]!;
    const cs = cf.width;
    ctx.globalAlpha = 0.16;
    const cox = ((-ox * 1 + t * 3) % cs + cs) % cs - cs, coy = ((-oy + t * 2) % cs + cs) % cs - cs;
    for (let y = coy; y < bh; y += cs) for (let x = cox; x < bw; x += cs) ctx.drawImage(cf, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // 3. декор и обломки
    this.decor.draw(ctx, this.art.decor, ox, oy, bw, bh, t, lights, this.L.warm, (x, y) => this.fx.bubbles(x, y, 1, 1));
    this.wrecks = this.wrecks.filter((w) => (w.t += dt) < 60);
    for (const w of this.wrecks) {
      ctx.globalAlpha = w.t > 40 ? 1 - (w.t - 40) / 20 : 1;
      ctx.drawImage(w.img, Math.round(w.x - w.img.width / 2 - ox), Math.round(w.y - w.img.height / 2 - oy));
    }
    ctx.globalAlpha = 1;

    // 4. месторождения
    const nodes = nodeQuery(sim.ecs);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const wx = Position.x[n]! / FX_TO_PX, wy = Position.y[n]! / FX_TO_PX;
      if (!this.fog.isExplored(wx / T, wy / T)) continue;
      const k = ResourceNode.amount[n]! / ResourceNode.max[n]!;
      const spr = this.sprites.crystals[k > 0.66 ? 2 : k > 0.33 ? 1 : 0]!;
      ctx.drawImage(spr, Math.round(wx - 10 - ox), Math.round(wy - 12 - oy));
      lights.push({ x: wx, y: wy - 2, r: 18, tex: this.L.cyan, a: 0.35 + 0.15 * Math.sin(t * 2 + n) });
      if (Math.floor(t * 3 + n * 7) % 9 === 0) { ctx.fillStyle = css(C.white!); ctx.fillRect(Math.round(wx - 4 - ox + (n % 7)), Math.round(wy - 8 - oy), 1, 1); }
    }

    // 5. юниты
    const ents = unitQuery(sim.ecs);
    const list: { e: number; x: number; y: number }[] = [];
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const x = (Position.px[e]! + (Position.x[e]! - Position.px[e]!) * alpha) / FX_TO_PX;
      const y = (Position.py[e]! + (Position.y[e]! - Position.py[e]!) * alpha) / FX_TO_PX;
      if (Owner.player[e] !== this.player && !this.fog.isVisible(x / T, y / T)) continue;
      if (x < ox - 48 || y < oy - 48 || x > ox + bw + 48 || y > oy + bh + 48) continue;
      list.push({ e, x, y });
    }
    list.sort((a, b) => a.y - b.y || a.e - b.e);
    this.picks = [];
    // кольца выделения и тени — под корпусами
    for (const { e, x, y } of list) {
      const set = this.sprites.units.get(this.reg.units[Unit.def[e]!]!.raw.sprite)!;
      const lift = [2, 4, 7][Mover.layer[e]!]!;
      const sh = this.shadow(set.size);
      ctx.drawImage(sh, Math.round(x - sh.width / 2 - ox + lift), Math.round(y - sh.height / 2 - oy + lift + 1));
      if (selection.has(e) || e === this.hover) this.ring(x - ox, y - oy + 2, set.size * 0.46, Owner.player[e] === this.player ? C.select! : C.hpLow!, selection.has(e));
    }
    for (const { e, x, y } of list) this.drawUnit(sim, e, x, y, ox, oy);

    // 6. снаряды
    for (const p of sim.projectiles) {
      const x = p.x / FX_TO_PX, y = p.y / FX_TO_PX;
      if (!this.fog.isVisible(x / T, y / T)) continue;
      this.drawProjectile(p, x, y, ox, oy);
    }

    // 7. дым и обломки, затем затемнение и свет, затем огонь
    this.fx.drawBottom(ctx, ox, oy);
    ctx.fillStyle = 'rgba(2,10,30,0.24)';
    ctx.fillRect(0, 0, bw, bh);
    this.fx.lights(lights);
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const x = l.x - ox, y = l.y - oy;
      if (x < -l.r || y < -l.r || x > bw + l.r || y > bh + l.r) continue;
      ctx.globalAlpha = Math.min(0.7, l.a);
      ctx.drawImage(l.tex, Math.round(x - l.r), Math.round(y - l.r), Math.round(l.r * 2), Math.round(l.r * 2));
    }
    // лучи света сверху
    for (let i = 0; i < 4; i++) {
      const sway = Math.sin(t * 0.15 + i * 1.9);
      ctx.globalAlpha = 0.045 + 0.03 * Math.sin(t * 0.3 + i);
      ctx.setTransform(1, 0, -0.45 + sway * 0.06, 1, ((i + 0.5) / 4) * bw + sway * 30 - ((ox * 0.2) % bw), 0);
      ctx.drawImage(this.ray, -40, -10, 80 + i * 10, bh * 1.2);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.fx.drawTop(ctx, ox, oy);
    this.drawSnow(ox, oy);

    // 8. мягкий туман войны
    this.drawFog(sim, ox, oy);

    // 9. полоски здоровья и интерфейс поверх
    for (const { e, x, y } of list) {
      const set = this.sprites.units.get(this.reg.units[Unit.def[e]!]!.raw.sprite)!;
      const sel = selection.has(e);
      if (sel || e === this.hover || Health.hp[e]! < Health.maxHp[e]!) this.hpBar(Math.round(x - ox), Math.round(y - set.size / 2 - oy) - 1, Math.max(10, Math.round(set.size * 0.6)), Health.hp[e]! / Health.maxHp[e]!);
      if (sel && hasComponent(sim.ecs, Building, e) && Owner.player[e] === this.player) this.rally(sim, e, x - ox, y - oy, ox, oy);
    }
    this.markers = this.markers.filter((m) => (m.t += dt) < 0.6);
    for (const m of this.markers) {
      const s = Math.round(6 - m.t * 8);
      const x = Math.round(m.x - ox), y = Math.round(m.y - oy);
      ctx.fillStyle = css(C.ink!);
      for (let k = -s; k <= s; k++) { ctx.fillRect(x + k + 1, y + k + 1, 1, 1); ctx.fillRect(x + k + 1, y - k + 1, 1, 1); }
      ctx.fillStyle = css(m.color);
      for (let k = -s; k <= s; k++) { ctx.fillRect(x + k, y + k, 1, 1); ctx.fillRect(x + k, y - k, 1, 1); }
    }
    if (this.box) {
      const b = this.box;
      const x = Math.round(Math.min(b.x0, b.x1)), y = Math.round(Math.min(b.y0, b.y1));
      const w = Math.round(Math.abs(b.x1 - b.x0)), h = Math.round(Math.abs(b.y1 - b.y0));
      ctx.fillStyle = css(C.select!, 0.12);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = css(C.select!);
      ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h, w + 1, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w, y, 1, h);
    }
  }

  private drawUnit(sim: SimWorld, e: number, x: number, y: number, ox: number, oy: number): void {
    const ctx = this.ctx;
    const C = this.sprites.colors;
    const t = this.time;
    const def = this.reg.units[Unit.def[e]!]!;
    const set = this.sprites.units.get(def.raw.sprite)!;
    const team = Owner.player[e]!;
    const building = hasComponent(sim.ecs, Building, e);
    const dirs = set.frames[team]!;
    const angle = Facing.angle[e]!;
    const dir = building ? 0 : Math.round(angle / 8192) & 7;
    const moving = Position.x[e] !== Position.px[e] || Position.y[e] !== Position.py[e];
    const mining = hasComponent(sim.ecs, Harvester, e) && Harvester.state[e] === 2;
    const anim = building ? Math.floor(t * 2) % 2 : (moving || mining) ? Math.floor(t * 10 + e) % 2 : 0;
    const bob = Mover.layer[e]! > 0 && !building ? Math.round(Math.sin(t * 2.5 + e) * 0.7) : 0;
    const dx = Math.round(x - set.size / 2 - ox), dy = Math.round(y - set.size / 2 - oy) + bob;
    ctx.drawImage(dirs[dir]![anim]!, dx, dy);
    const a = (angle / 65536) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);

    if (set.turret) {
      // башня крейсера смотрит на цель
      let ta = a;
      const tg = hasComponent(sim.ecs, Weapon, e) ? Weapon.target[e]! : -1;
      if (tg >= 0 && entityExists(sim.ecs, tg) && hasComponent(sim.ecs, Position, tg)) ta = Math.atan2(Position.y[tg]! - Position.y[e]!, Position.x[tg]! - Position.x[e]!);
      const ti = Math.round((((ta / (Math.PI * 2)) % 1) + 1) % 1 * 16) % 16;
      ctx.drawImage(set.turret[team]![ti]!, Math.round(x + ca * set.turretOffset - 12 - ox), Math.round(y + sa * set.turretOffset - 12 - oy) + bob);
    }
    if (hasComponent(sim.ecs, Harvester, e) && Harvester.carry[e]! > 0) {
      // кристаллы в грузовом отсеке
      const cx = Math.round(x - ca * 3 - ox), cy = Math.round(y - sa * 3 - oy) + bob;
      const n = Math.min(4, Math.ceil(Harvester.carry[e]! / 10));
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = css(k % 2 ? C.metalDark! : C.metal!);
        ctx.fillRect(cx - 2 + (k % 2) * 3, cy - 2 + Math.floor(k / 2) * 3, 2, 2);
      }
    }
    this.picks.push({ e, x, y, r: set.size * 0.42 });

    // свет: двигатель, прожектор, маяк базы
    if (building) {
      this.lights.push({ x: x + set.size * 0.27, y: y - set.size * 0.31, r: 16, tex: this.L.red, a: anim ? 0.9 : 0.15 });
      this.lights.push({ x, y, r: 30, tex: this.L.team[team]!, a: 0.35 });
    } else {
      const sx = x - ca * set.stern, sy = y - sa * set.stern;
      this.lights.push({ x: sx, y: sy, r: moving ? 10 : 7, tex: set.engine === C.ember ? this.L.warm : this.L.cyan, a: moving ? 0.35 : 0.18 });
      this.lights.push({ x: x + ca * set.length * 0.9, y: y + sa * set.length * 0.9, r: 12, tex: this.L.white, a: 0.1 });
      if (moving && Math.random() < 0.35) this.fx.trail(sx, sy);
    }
    // повреждения: дым, затем искры и огонь
    const hp = Health.hp[e]! / Health.maxHp[e]!;
    if (hp < 0.5 && Math.random() < (0.5 - hp) * 0.5) this.fx.smoke(x + (Math.random() - 0.5) * set.size * 0.4, y - 2);
    if (hp < 0.25) {
      if (Math.random() < 0.08) this.fx.sparks(x, y, 2);
      this.lights.push({ x, y, r: 10, tex: this.L.warm, a: 0.3 + Math.random() * 0.3 });
    }
  }

  private drawProjectile(p: SimWorld['projectiles'][number], x: number, y: number, ox: number, oy: number): void {
    const ctx = this.ctx;
    const C = this.sprites.colors;
    const team = this.sprites.teams[p.owner] ?? this.sprites.teams[0]!;
    const a = Math.atan2(p.ty - p.y, p.tx - p.x);
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = Math.round(x - ox), py = Math.round(y - oy);
    switch (p.kind) {
      case 0: // лазерный импульс: белое ядро, кайма в цвет команды
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = css(k < 2 ? C.white! : team.main);
          ctx.fillRect(Math.round(px - ca * k), Math.round(py - sa * k), 1, 1);
        }
        this.lights.push({ x, y, r: 9, tex: this.L.team[p.owner] ?? this.L.cyan, a: 0.45 });
        break;
      case 1: // торпеда с хвостом пузырей
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = css(k === 0 ? C.white! : k < 4 ? C.hullDark! : team.main);
          ctx.fillRect(Math.round(px - ca * k), Math.round(py - sa * k), 1, 1);
          ctx.fillRect(Math.round(px - ca * k - sa * 0.6), Math.round(py - sa * k + ca * 0.6), 1, 1);
        }
        if (Math.random() < 0.8) this.fx.trail(x - ca * 6, y - sa * 6);
        this.lights.push({ x: x - ca * 5, y: y - sa * 5, r: 7, tex: this.L.cyan, a: 0.5 });
        break;
      case 2: { // снаряд крейсера летит дугой, на дне — его тень
        const sx = p.sx / FX_TO_PX, sy = p.sy / FX_TO_PX;
        const total = Math.hypot(p.tx / FX_TO_PX - sx, p.ty / FX_TO_PX - sy) || 1;
        const k = 1 - Math.hypot(p.tx / FX_TO_PX - x, p.ty / FX_TO_PX - y) / total;
        const h = Math.sin(Math.max(0, Math.min(1, k)) * Math.PI) * Math.min(26, total * 0.3);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px - 1, py, 3, 2);
        ctx.fillStyle = css(C.ink!); ctx.fillRect(px - 2, py - h - 2, 5, 5);
        ctx.fillStyle = css(C.lava!); ctx.fillRect(px - 1, py - h - 1, 3, 3);
        ctx.fillStyle = css(C.white!); ctx.fillRect(px, py - h - 1, 1, 1);
        this.lights.push({ x, y: y - h, r: 14, tex: this.L.warm, a: 0.7 });
        if (Math.random() < 0.5) this.fx.trail(x, y - h, C.ember);
        break;
      }
      default: // плазма базы
        ctx.fillStyle = css(C.hazard!); ctx.fillRect(px - 2, py - 1, 4, 3); ctx.fillRect(px - 1, py - 2, 2, 5);
        ctx.fillStyle = css(C.white!); ctx.fillRect(px - 1, py - 1, 2, 2);
        this.lights.push({ x, y, r: 16, tex: this.L.warm, a: 0.8 });
    }
  }

  private drawFog(sim: SimWorld, ox: number, oy: number): void {
    const d = this.fogImg.data;
    const n = sim.grid.width * sim.grid.h;
    for (let i = 0; i < n; i++) {
      d[i * 4] = 0; d[i * 4 + 1] = 2; d[i * 4 + 2] = 10;
      d[i * 4 + 3] = this.fog.visible[i] ? 0 : this.fog.explored[i] ? 150 : 255;
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
    // увеличение со сглаживанием даёт мягкую границу видимости
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.fogCanvas, -ox, -oy, sim.grid.width * this.T, sim.grid.h * this.T);
    this.ctx.imageSmoothingEnabled = false;
  }

  private drawSnow(ox: number, oy: number): void {
    const ctx = this.ctx;
    for (const s of this.snow) {
      s.y += 0.06 * s.d;
      s.x += Math.sin(this.time * 0.7 + s.d * 10) * 0.03;
      const x = Math.floor((((s.x - ox * s.d) % this.bw) + this.bw) % this.bw);
      const y = Math.floor((((s.y - oy * s.d) % this.bh) + this.bh) % this.bh);
      ctx.fillStyle = css(this.sprites.colors.foam!, 0.35 + s.d * 0.5);
      ctx.fillRect(x, y, 1, 1);
    }
  }

  private shadow(size: number): HTMLCanvasElement {
    const cached = this.shadows.get(size);
    if (cached) return cached;
    const w = Math.round(size * 0.85), h = Math.round(size * 0.55);
    const [c, ctx] = makeCanvas(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2);
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      ctx.fillStyle = `rgba(0,6,18,${(0.55 * (1 - d * 0.6)).toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
    }
    this.shadows.set(size, c);
    return c;
  }

  /** Эллипс выделения на дне; у выбранных — пульсирует. */
  private ring(cx: number, cy: number, r: number, c: RGB, pulse: boolean): void {
    const ctx = this.ctx;
    const rr = r + (pulse ? Math.round(Math.sin(this.time * 6)) * 0.5 : 0);
    ctx.fillStyle = css(c, pulse ? 1 : 0.55);
    const steps = Math.ceil(rr * 6);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (!pulse && i % 2) continue;
      ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.62), 1, 1);
    }
  }

  private hpBar(cx: number, y: number, w: number, k: number): void {
    const C = this.sprites.colors;
    const ctx = this.ctx;
    const x = cx - Math.floor(w / 2);
    ctx.fillStyle = css(C.ink!);
    ctx.fillRect(x - 1, y - 1, w + 2, 4);
    const col = k > 0.6 ? C.select! : k > 0.3 ? C.hpMid! : C.hpLow!;
    const fill = Math.max(1, Math.round(w * k));
    ctx.fillStyle = css(col);
    ctx.fillRect(x, y, fill, 2);
    ctx.fillStyle = css(C.white!, 0.5);
    ctx.fillRect(x, y, fill, 1);
    // деления по 25%
    ctx.fillStyle = css(C.ink!);
    for (let s = 1; s < 4; s++) ctx.fillRect(x + Math.round((w * s) / 4), y, 1, 2);
  }

  private rally(sim: SimWorld, b: number, bx: number, by: number, ox: number, oy: number): void {
    const p = sim.prod.get(b);
    if (!p || (p.rallyX === Position.x[b] && p.rallyY === Position.y[b])) return;
    const ctx = this.ctx;
    const rx = p.rallyX / FX_TO_PX - ox, ry = p.rallyY / FX_TO_PX - oy;
    const n = Math.max(1, Math.floor(Math.hypot(rx - bx, ry - by) / 3));
    ctx.fillStyle = css(this.sprites.colors.select!);
    for (let k = 0; k < n; k += 2) ctx.fillRect(Math.round(bx + ((rx - bx) * k) / n), Math.round(by + ((ry - by) * k) / n), 1, 1);
    ctx.fillRect(Math.round(rx), Math.round(ry) - 8, 1, 9);
    ctx.fillStyle = css(this.sprites.teams[this.player]!.main);
    ctx.fillRect(Math.round(rx) + 1, Math.round(ry) - 8, 5, 4);
  }
}
