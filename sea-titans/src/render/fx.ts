import { fillCircle, strokeCircle, type RGB } from './pixel';
import type { Colors } from './sprites';

const css = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`;

interface Particle {
  kind: 0 | 1 | 2 | 3; // 0 — пиксель-обломок, 1 — пузырь, 2 — вспышка, 3 — ударная волна
  x: number; y: number;
  vx: number; vy: number;
  life: number; max: number;
  r: number;
  color: RGB;
}

/** Взрывы, пузыри, обломки и тряска экрана. Чисто визуально, на симуляцию не влияет. */
export class Fx {
  private ps: Particle[] = [];
  shake = 0;

  constructor(private readonly C: Colors) {}

  bubbles(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.ps.push({ kind: 1, x: x + rnd(4), y: y + rnd(3), vx: rnd(4), vy: -10 - Math.random() * 18, life: 0, max: 0.8 + Math.random() * 1.2, r: 0, color: this.C.foam! });
    }
  }

  trail(x: number, y: number): void {
    this.ps.push({ kind: 1, x, y, vx: rnd(2), vy: -4 - Math.random() * 6, life: 0, max: 0.5 + Math.random() * 0.4, r: 0, color: this.C.glint! });
  }

  muzzle(x: number, y: number): void {
    this.ps.push({ kind: 2, x, y, vx: 0, vy: 0, life: 0, max: 0.07, r: 2, color: this.C.white! });
  }

  hit(x: number, y: number, splashPx: number): void {
    const big = splashPx > 0;
    this.ps.push({ kind: 2, x, y, vx: 0, vy: 0, life: 0, max: big ? 0.35 : 0.18, r: big ? splashPx : 3, color: this.C.ember! });
    if (big) this.ps.push({ kind: 3, x, y, vx: 0, vy: 0, life: 0, max: 0.4, r: splashPx + 4, color: this.C.glint! });
    this.bubbles(x, y, big ? 8 : 3);
    if (big) this.shake = Math.max(this.shake, 2);
  }

  explosion(x: number, y: number, sizePx: number, building: boolean): void {
    const r = building ? 22 : 5 + sizePx * 0.9;
    this.ps.push({ kind: 2, x, y, vx: 0, vy: 0, life: 0, max: building ? 0.9 : 0.5, r, color: this.C.white! });
    this.ps.push({ kind: 3, x, y, vx: 0, vy: 0, life: 0, max: building ? 0.8 : 0.45, r: r * 1.8, color: this.C.foam! });
    const debris = building ? 40 : 12;
    for (let i = 0; i < debris; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * (building ? 80 : 45);
      this.ps.push({ kind: 0, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.6 + Math.random() * 0.8, r: 0, color: [this.C.hull!, this.C.ember!, this.C.lava!, this.C.hullDark!][i % 4]! });
    }
    this.bubbles(x, y, building ? 30 : 10);
    this.shake = Math.max(this.shake, building ? 9 : 3);
  }

  update(dt: number): void {
    let k = 0;
    for (const p of this.ps) {
      p.life += dt;
      if (p.life >= p.max) continue;
      if (p.kind === 0) { p.vx *= 1 - 3 * dt; p.vy = p.vy * (1 - 3 * dt) + 14 * dt; } // вода тормозит, обломки оседают
      if (p.kind === 1) p.vx = Math.sin((p.life + p.x) * 9) * 6;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.ps[k++] = p;
    }
    this.ps.length = k;
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  draw(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
    const C = this.C;
    for (const p of this.ps) {
      const t = p.life / p.max;
      const x = Math.round(p.x - ox), y = Math.round(p.y - oy);
      switch (p.kind) {
        case 0:
          ctx.fillStyle = css(t > 0.7 ? C.rockDark! : p.color);
          ctx.fillRect(x, y, 1, 1);
          break;
        case 1:
          ctx.fillStyle = css(p.color);
          if (t < 0.6) { ctx.fillRect(x, y, 1, 1); if (t < 0.25) ctx.fillRect(x + 1, y - 1, 1, 1); } else if ((x + y) % 2 === 0) ctx.fillRect(x, y, 1, 1);
          break;
        case 2: {
          // вспышка: белое → жёлтое → оранжевое → красное, радиус растёт и опадает
          const seq = [C.white!, C.ember!, C.lava!, C.coral!, C.rockDark!];
          ctx.fillStyle = css(seq[Math.min(seq.length - 1, Math.floor(t * seq.length))]!);
          fillCircle(ctx, x, y, Math.max(1, p.r * (t < 0.3 ? 0.5 + t * 1.6 : 1 - (t - 0.3))));
          if (t < 0.25 && p.r > 3) { ctx.fillStyle = css(C.white!); fillCircle(ctx, x, y, p.r * 0.35); }
          break;
        }
        case 3:
          ctx.fillStyle = css(t < 0.5 ? p.color : C.shallow!);
          strokeCircle(ctx, x, y, p.r * (0.3 + t * 0.9), t < 0.5 ? 2 : 1);
          break;
      }
    }
  }

  /** Сдвиг камеры для тряски (целые пиксели). */
  offset(): [number, number] {
    if (this.shake < 0.5) return [0, 0];
    return [Math.round(rnd(this.shake)), Math.round(rnd(this.shake))];
  }
}

const rnd = (s: number) => (Math.random() * 2 - 1) * s;
