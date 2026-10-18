import { Container, Sprite, Texture } from 'pixi.js';

/**
 * Экранные слои атмосферы: лучи света сверху (god rays), взвесь «морского снега» с параллаксом,
 * виньетка-толща. Работает в экранных координатах, поверх мира.
 */
export class Atmosphere {
  readonly root = new Container();
  private readonly rays: { s: Sprite; phase: number; speed: number; baseX: number }[] = [];
  private readonly snow: { s: Sprite; depth: number; drift: number; x: number; y: number }[] = [];
  private readonly vignette: Sprite;
  private w = 1;
  private h = 1;

  constructor() {
    const rayTex = rayTexture();
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(rayTex);
      s.anchor.set(0.5, 0);
      s.blendMode = 'add';
      s.alpha = 0.1;
      this.rays.push({ s, phase: i * 1.37, speed: 0.07 + (i % 3) * 0.03, baseX: (i + 0.5) / 7 });
      this.root.addChild(s);
    }
    const dot = snowTexture();
    for (let i = 0; i < 420; i++) {
      const s = new Sprite(dot);
      s.anchor.set(0.5);
      const depth = 0.25 + Math.random() * 0.9;
      s.alpha = 0.15 + depth * 0.35;
      s.scale.set(0.3 + depth * 0.6);
      s.blendMode = 'add';
      this.snow.push({ s, depth, drift: Math.random() * Math.PI * 2, x: Math.random(), y: Math.random() });
      this.root.addChild(s);
    }
    this.vignette = new Sprite(vignetteTexture());
    this.root.addChild(this.vignette);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.vignette.width = w;
    this.vignette.height = h;
  }

  /** camX/camY — сдвиг камеры в экранных px с прошлого кадра (параллакс взвеси). */
  update(t: number, dtSec: number, camDX: number, camDY: number): void {
    for (const r of this.rays) {
      const sway = Math.sin(t * r.speed + r.phase);
      r.s.x = (r.baseX + sway * 0.06) * this.w;
      r.s.y = -20;
      r.s.height = this.h * 1.25;
      r.s.width = this.w * (0.12 + 0.05 * Math.sin(t * 0.13 + r.phase));
      r.s.skew.x = -0.35 + sway * 0.08;
      r.s.alpha = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 0.21 + r.phase * 2));
    }
    for (const p of this.snow) {
      p.y += (dtSec * (0.004 + p.depth * 0.01)) - (camDY * p.depth * 0.6) / this.h;
      p.x += (Math.sin(t * 0.4 + p.drift) * 0.0006) - (camDX * p.depth * 0.6) / this.w;
      p.x -= Math.floor(p.x);
      p.y -= Math.floor(p.y);
      p.s.x = p.x * this.w;
      p.s.y = p.y * this.h;
    }
  }
}

/** Пузыри за кормой и маркеры приказов — в координатах мира. */
export class WorldFx {
  readonly root = new Container();
  private readonly pool: { s: Sprite; life: number; max: number; vx: number; vy: number }[] = [];
  private readonly markers: { s: Sprite; life: number }[] = [];

  constructor(bubble: Texture, private readonly markerTex: Texture) {
    for (let i = 0; i < 700; i++) {
      const s = new Sprite(bubble);
      s.anchor.set(0.5);
      s.visible = false;
      this.root.addChild(s);
      this.pool.push({ s, life: 0, max: 1, vx: 0, vy: 0 });
    }
  }

  emitBubble(x: number, y: number, size = 1): void {
    const p = this.pool.find((q) => q.life <= 0);
    if (!p) return;
    p.life = p.max = 0.9 + Math.random() * 0.9;
    p.vx = (Math.random() - 0.5) * 8;
    p.vy = -18 - Math.random() * 22;
    p.s.position.set(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 4);
    p.s.scale.set((0.25 + Math.random() * 0.35) * size);
    p.s.visible = true;
    p.s.zIndex = 1;
  }

  marker(x: number, y: number, color: number): void {
    const s = new Sprite(this.markerTex);
    s.anchor.set(0.5);
    s.tint = color;
    s.position.set(x, y);
    this.root.addChild(s);
    this.markers.push({ s, life: 0.6 });
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.alpha = Math.min(1, p.life / p.max * 1.5) * 0.8;
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i]!;
      m.life -= dt;
      const k = Math.max(0, m.life / 0.6);
      m.s.scale.set(0.4 + (1 - k) * 0.8, (0.4 + (1 - k) * 0.8) * 0.5);
      m.s.alpha = k;
      if (m.life <= 0) { m.s.destroy(); this.markers.splice(i, 1); }
    }
  }
}

function rayTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d')!;
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(170,230,255,0.9)');
  v.addColorStop(0.6, 'rgba(120,200,240,0.25)');
  v.addColorStop(1, 'rgba(120,200,240,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 64, 256);
  // мягкие края по горизонтали
  ctx.globalCompositeOperation = 'destination-in';
  const hgr = ctx.createLinearGradient(0, 0, 64, 0);
  hgr.addColorStop(0, 'rgba(0,0,0,0)');
  hgr.addColorStop(0.5, 'rgba(0,0,0,1)');
  hgr.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hgr;
  ctx.fillRect(0, 0, 64, 256);
  return Texture.from(c);
}

function snowTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
  g.addColorStop(0, 'rgba(210,240,255,1)');
  g.addColorStop(1, 'rgba(210,240,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 8);
  return Texture.from(c);
}

function vignetteTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 230, 120, 256, 256, 380);
  g.addColorStop(0, 'rgba(0,10,20,0)');
  g.addColorStop(0.7, 'rgba(0,12,24,0.35)');
  g.addColorStop(1, 'rgba(0,6,14,0.85)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  // сверху светлее (ближе к поверхности), снизу темнее
  const v = ctx.createLinearGradient(0, 0, 0, 512);
  v.addColorStop(0, 'rgba(40,120,160,0.12)');
  v.addColorStop(1, 'rgba(0,0,10,0.35)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 512, 512);
  return Texture.from(c);
}

export function markerTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(32, 32, 26, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(32, 32, 12, 0, Math.PI * 2); ctx.stroke();
  return Texture.from(c);
}
