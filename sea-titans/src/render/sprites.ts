import { Rectangle, Texture } from 'pixi.js';
import type { AssetEntry, AssetManifest } from '../data/schema';

/** Набор кадров одного спрайта: base — серый корпус, mask — области цвета команды. */
export interface SpriteSet {
  directions: number;
  base: Texture[];
  mask: Texture[] | null;
  anchor: [number, number];
  /** Размер корпуса в тайлах — для тени и кольца выделения. */
  length: number;
  width: number;
}

/**
 * Загрузка спрайтов по манифесту. Пока все источники процедурные (`procedural:*`);
 * финальные атласы из Blender подключаются полем `atlas` без изменений в коде рендера.
 */
export function buildSprites(manifest: AssetManifest, tileW: number): Map<string, SpriteSet> {
  const out = new Map<string, SpriteSet>();
  for (const [id, entry] of Object.entries(manifest)) {
    if (entry.source === 'procedural:sub') out.set(id, proceduralSub(entry, tileW));
    else throw new Error(`Ассет ${id}: источник ${entry.source} пока не поддержан (атласы — этап 7)`);
  }
  return out;
}

function proceduralSub(entry: AssetEntry, tileW: number): SpriteSet {
  const p = entry.params ?? {};
  const L = p.length ?? 1, Wd = p.width ?? 0.3, tower = p.tower ?? 0.4;
  const dirs = entry.directions;
  const scale = tileW / 2; // px на тайл по каждой изо-оси
  const size = Math.ceil(L * scale * 1.6 + 40);
  const base = document.createElement('canvas');
  const mask = document.createElement('canvas');
  base.width = mask.width = size * dirs;
  base.height = mask.height = size;
  const bc = base.getContext('2d')!;
  const mc = mask.getContext('2d')!;

  for (let d = 0; d < dirs; d++) {
    const theta = (d / dirs) * Math.PI * 2;
    const ox = d * size + size / 2, oy = size / 2 + 4;
    drawSub(bc, mc, ox, oy, theta, L, Wd, tower, scale);
  }

  const bTex = Texture.from(base);
  const mTex = Texture.from(mask);
  const frames = (src: Texture) =>
    Array.from({ length: dirs }, (_, d) => new Texture({ source: src.source, frame: new Rectangle(d * size, 0, size, size) }));
  return { directions: dirs, base: frames(bTex), mask: entry.teamMask ? frames(mTex) : null, anchor: entry.anchor, length: L, width: Wd };
}

/** Корпус-«сигара» в изометрии: нижняя тёмная часть, светлая палуба, рубка, винт, прожектор. */
function drawSub(
  bc: CanvasRenderingContext2D, mc: CanvasRenderingContext2D,
  ox: number, oy: number, theta: number, L: number, Wd: number, tower: number, s: number,
): void {
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const proj = (lx: number, ly: number, z = 0): [number, number] => {
    const wx = lx * cos - ly * sin, wy = lx * sin + ly * cos;
    return [ox + (wx - wy) * s, oy + (wx + wy) * s * 0.5 - z];
  };
  const thick = Wd * s * 0.9;
  const hull = (z: number, shrink = 1): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const lx = Math.cos(t) * L * 0.5;
      // корма уже носа
      const taper = Math.cos(t) < 0 ? 0.75 + 0.25 * (1 + Math.cos(t)) : 1;
      pts.push(proj(lx, Math.sin(t) * Wd * 0.5 * taper * shrink, z));
    }
    return pts;
  };
  const poly = (ctx: CanvasRenderingContext2D, pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // днище
  bc.fillStyle = '#1b262e';
  poly(bc, hull(0)); bc.fill();
  // борта: заливаем между днищем и палубой
  const top = hull(thick, 0.92);
  bc.fillStyle = '#3d4d57';
  for (let k = 1; k <= thick; k += 1) { poly(bc, hull(k, 1 - (k / thick) * 0.08)); bc.fill(); }
  // палуба
  const g = bc.createLinearGradient(ox - L * s, oy - thick - Wd * s, ox + L * s, oy + Wd * s);
  g.addColorStop(0, '#9fb3bd');
  g.addColorStop(1, '#5d707b');
  bc.fillStyle = g;
  poly(bc, top); bc.fill();
  bc.strokeStyle = 'rgba(10,20,25,0.6)';
  bc.lineWidth = 1;
  poly(bc, top); bc.stroke();

  // полоса команды по хребту палубы
  const stripe = (ctx: CanvasRenderingContext2D, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, Wd * s * 0.35);
    const [ax, ay] = proj(-L * 0.36, 0, thick + 1);
    const [bx, by] = proj(L * 0.3, 0, thick + 1);
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  stripe(bc, '#c9d4da');
  stripe(mc, '#ffffff');

  // рубка
  const th = tower * s * 0.7;
  const tw = Wd * 0.45, tl = L * 0.16;
  for (let k = 0; k <= th; k++) {
    bc.fillStyle = k === Math.floor(th) ? '#b8c7cf' : '#4f616c';
    bc.beginPath();
    const c = proj(-L * 0.02, 0, thick + k);
    bc.ellipse(c[0], c[1], tl * s * 0.9, tw * s * 0.55, 0, 0, Math.PI * 2);
    bc.fill();
  }
  // верх рубки тоже в цвет команды
  mc.fillStyle = 'rgba(255,255,255,0.85)';
  mc.beginPath();
  const tc = proj(-L * 0.02, 0, thick + th);
  mc.ellipse(tc[0], tc[1], tl * s * 0.9, tw * s * 0.55, 0, 0, Math.PI * 2);
  mc.fill();

  // винт на корме
  const [px, py] = proj(-L * 0.52, 0, thick * 0.5);
  bc.fillStyle = '#7c6a4a';
  bc.beginPath(); bc.ellipse(px, py, 2.5, 4, 0, 0, Math.PI * 2); bc.fill();

  // прожектор на носу
  const [lx, ly] = proj(L * 0.5, 0, thick * 0.6);
  const lg = bc.createRadialGradient(lx, ly, 0, lx, ly, 5);
  lg.addColorStop(0, 'rgba(255,250,210,1)');
  lg.addColorStop(1, 'rgba(255,250,210,0)');
  bc.fillStyle = lg;
  bc.beginPath(); bc.arc(lx, ly, 5, 0, Math.PI * 2); bc.fill();
}

/** Мягкая круглая текстура (тени, пузыри, свечение). */
export function softDot(size: number, inner: string, outer: string): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Пузырь: прозрачный с бликом. */
export function bubbleTexture(): Texture {
  const s = 16;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = 'rgba(200,240,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(s / 2 - 2.5, s / 2 - 2.5, 1.6, 0, Math.PI * 2); ctx.fill();
  return Texture.from(c);
}
