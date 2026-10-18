import type { Light } from './env';
import { fillCircle, strokeCircle, type RGB } from './pixel';
import { bayer } from './shade';
import type { Colors } from './sprites';

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

const enum K { Debris, Bubble, Fire, Ring, Smoke, Spark }

interface Particle {
  k: K;
  x: number; y: number;
  vx: number; vy: number;
  life: number; max: number;
  r: number;
  color: RGB;
}

export interface LightTex { warm: HTMLCanvasElement; white: HTMLCanvasElement; cyan: HTMLCanvasElement; red: HTMLCanvasElement }

/** Взрывы, дым, искры, пузыри и тряска экрана. Только визуал — на симуляцию не влияет. */
export class Fx {
  private ps: Particle[] = [];
  shake = 0;

  constructor(private readonly C: Colors, private readonly L: LightTex) {}

  private add(p: Omit<Particle, 'life'>): void {
    if (this.ps.length < 2500) this.ps.push({ ...p, life: 0 });
  }

  bubbles(x: number, y: number, n: number, spread = 4): void {
    for (let i = 0; i < n; i++) this.add({ k: K.Bubble, x: x + rnd(spread), y: y + rnd(spread * 0.7), vx: rnd(4), vy: -10 - Math.random() * 20, max: 0.8 + Math.random() * 1.3, r: Math.random() < 0.2 ? 1 : 0, color: this.C.foam! });
  }

  trail(x: number, y: number, color?: RGB): void {
    this.add({ k: K.Bubble, x, y, vx: rnd(2), vy: -4 - Math.random() * 6, max: 0.45 + Math.random() * 0.4, r: 0, color: color ?? this.C.glint! });
  }

  smoke(x: number, y: number, size = 1): void {
    this.add({ k: K.Smoke, x: x + rnd(2), y: y + rnd(2), vx: rnd(3), vy: -6 - Math.random() * 6, max: 1 + Math.random() * 0.8, r: 1.5 * size, color: this.C.rockDark! });
  }

  sparks(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * 60;
      this.add({ k: K.Spark, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: 0.15 + Math.random() * 0.2, r: 0, color: Math.random() < 0.5 ? this.C.ember! : this.C.white! });
    }
  }

  muzzle(x: number, y: number, color: RGB): void {
    this.add({ k: K.Fire, x, y, vx: 0, vy: 0, max: 0.08, r: 2.5, color });
  }

  hit(x: number, y: number, splashPx: number, kind: number): void {
    if (splashPx > 0) {
      this.add({ k: K.Fire, x, y, vx: 0, vy: 0, max: 0.55, r: splashPx * 0.8, color: this.C.ember! });
      this.add({ k: K.Ring, x, y, vx: 0, vy: 0, max: 0.45, r: splashPx + 6, color: this.C.glint! });
      for (let i = 0; i < 5; i++) this.smoke(x + rnd(splashPx * 0.6), y + rnd(splashPx * 0.6), 1.6);
      this.sparks(x, y, 10);
      this.bubbles(x, y, 12, splashPx * 0.6);
      this.shake = Math.max(this.shake, 2.5);
    } else if (kind === 1) { // торпеда
      this.add({ k: K.Fire, x, y, vx: 0, vy: 0, max: 0.3, r: 5, color: this.C.ember! });
      this.sparks(x, y, 6);
      this.bubbles(x, y, 6);
      this.shake = Math.max(this.shake, 1);
    } else {
      this.add({ k: K.Fire, x, y, vx: 0, vy: 0, max: 0.14, r: 2.5, color: kind === 3 ? this.C.hazard! : this.C.glint! });
      this.sparks(x, y, 3);
    }
  }

  explosion(x: number, y: number, sizePx: number, building: boolean): void {
    const r = building ? 26 : 7 + sizePx * 0.9;
    this.add({ k: K.Fire, x, y, vx: 0, vy: 0, max: building ? 1.1 : 0.7, r, color: this.C.white! });
    this.add({ k: K.Ring, x, y, vx: 0, vy: 0, max: building ? 0.9 : 0.55, r: r * 2, color: this.C.glint! });
    for (let i = 0; i < (building ? 6 : 2); i++) {
      // вторичные взрывы вокруг
      const a = Math.random() * Math.PI * 2, d = r * (0.4 + Math.random() * 0.6);
      this.add({ k: K.Fire, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: 0, vy: 0, max: 0.4 + Math.random() * 0.4, r: r * 0.45, color: this.C.ember! });
    }
    const debris = building ? 50 : 16;
    for (let i = 0; i < debris; i++) {
      const a = Math.random() * Math.PI * 2, s = 25 + Math.random() * (building ? 90 : 55);
      this.add({ k: K.Debris, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, max: 0.8 + Math.random() * 1.2, r: Math.random() < 0.3 ? 1 : 0, color: [this.C.hull!, this.C.hullDark!, this.C.ember!, this.C.hullLight!][i % 4]! });
    }
    for (let i = 0; i < (building ? 14 : 5); i++) this.smoke(x + rnd(r * 0.5), y + rnd(r * 0.5), building ? 3 : 2);
    this.sparks(x, y, building ? 30 : 12);
    this.bubbles(x, y, building ? 40 : 14, r * 0.5);
    this.shake = Math.max(this.shake, building ? 10 : 3.5);
  }

  update(dt: number): void {
    let k = 0;
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      switch (p.k) {
        case K.Debris:
          p.vx *= 1 - 2.5 * dt; p.vy = p.vy * (1 - 2.5 * dt) + 16 * dt; // вода тормозит, обломки оседают
          if (Math.random() < dt * 6) this.trail(p.x, p.y, this.C.foam);
          break;
        case K.Bubble: p.vx = Math.sin((p.life + p.x) * 9) * 6; break;
        case K.Smoke: p.vx *= 1 - dt; p.r += dt * 3; break;
        case K.Spark: p.vx *= 1 - 6 * dt; p.vy *= 1 - 6 * dt; break;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.ps[k++] = p;
    }
    this.ps.length = k;
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  /** Дым и обломки — под светом; огонь и искры — поверх (см. drawTop). */
  drawBottom(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const C = this.C;
    for (const p of this.ps) {
      const t = p.life / p.max;
      const x = Math.round(p.x - ox), y = Math.round(p.y - oy);
      if (p.k === K.Smoke) {
        ctx.fillStyle = css(t < 0.4 ? C.rockDark! : C.ink!);
        // растворяется дизерингом
        const r = Math.round(p.r);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + r) continue;
          if (bayer(x + dx, y + dy) < 0.75 - t * 0.75) ctx.fillRect(x + dx, y + dy, 1, 1);
        }
      } else if (p.k === K.Debris) {
        ctx.fillStyle = css(t > 0.7 ? C.rockDark! : p.color);
        ctx.fillRect(x, y, p.r + 1, p.r + 1);
      } else if (p.k === K.Bubble) {
        ctx.fillStyle = css(p.color);
        if (p.r) { ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1); }
        else if (t < 0.6 || (x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  drawTop(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const C = this.C;
    for (const p of this.ps) {
      const t = p.life / p.max;
      const x = Math.round(p.x - ox), y = Math.round(p.y - oy);
      if (p.k === K.Fire) {
        const grow = t < 0.25 ? 0.55 + t * 1.8 : 1 - (t - 0.25) * 0.9;
        const r = Math.max(1, p.r * grow);
        // слои: красный край → оранжевый → жёлтый → белое ядро
        const layers: [RGB, number][] = t < 0.5
          ? [[C.lava!, 1], [C.ember!, 0.75], [C.hazard!, 0.5], [C.white!, 0.28]]
          : [[C.rockDark!, 1], [C.lava!, 0.7], [C.ember!, 0.4]];
        for (const [col, k] of layers) { ctx.fillStyle = css(col); jaggedCircle(ctx, x, y, r * k, p.x + p.y); }
      } else if (p.k === K.Ring) {
        ctx.fillStyle = css(t < 0.5 ? p.color : C.shallow!);
        strokeCircle(ctx, x, y, p.r * (0.25 + t * 0.9), t < 0.4 ? 2 : 1);
      } else if (p.k === K.Spark) {
        ctx.fillStyle = css(p.color);
        ctx.fillRect(x, y, 1, 1);
        ctx.fillRect(Math.round(x - p.vx * 0.02), Math.round(y - p.vy * 0.02), 1, 1);
      }
    }
  }

  lights(out: Light[]): void {
    for (const p of this.ps) {
      const t = p.life / p.max;
      if (p.k === K.Fire) out.push({ x: p.x, y: p.y, r: p.r * 3 + 8, tex: p.color === this.C.glint || p.color === this.C.hazard ? this.L.cyan : this.L.warm, a: (1 - t) * 0.65 });
      else if (p.k === K.Spark && Math.random() < 0.3) out.push({ x: p.x, y: p.y, r: 8, tex: this.L.warm, a: 0.4 * (1 - t) });
    }
  }

  offset(): [number, number] {
    if (this.shake < 0.5) return [0, 0];
    return [Math.round(rnd(this.shake)), Math.round(rnd(this.shake))];
  }
}

/** Круг с рваным краем — огонь выглядит живым. */
function jaggedCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, seed: number): void {
  r = Math.round(r);
  if (r <= 1) { fillCircle(ctx, cx, cy, r); return; }
  for (let dy = -r; dy <= r; dy++) {
    const j = Math.sin(dy * 1.7 + seed) * 0.9 + Math.sin(dy * 0.6 + seed * 2) * 0.6;
    const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + j);
    if (w >= 0) ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

const rnd = (s: number) => (Math.random() * 2 - 1) * s;
