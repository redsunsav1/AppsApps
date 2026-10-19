import { makeCanvas, type RGB } from './pixel';
import { bayer, ramp } from './shade';
import type { Decor } from './tiles';
import type { Colors } from './sprites';

const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/** Каустики: 8 кадров бесшовного узора, квантованы дизерингом, накладываются в режиме lighter. */
export function causticFrames(C: Colors, size = 128, frames = 8): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const TAU = Math.PI * 2;
  for (let f = 0; f < frames; f++) {
    const [c, ctx] = makeCanvas(size, size);
    const img = ctx.createImageData(size, size);
    const time = (f / frames) * TAU;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      // классическая формула «водных» каустик, бесшовная за счёт mod TAU
      const px = (x / size) * TAU - 250, py = (y / size) * TAU - 250;
      let ix = px, iy = py, cc = 1;
      for (let n = 0; n < 4; n++) {
        const t = time * (1 - 3.5 / (n + 1));
        const nx = px + Math.cos(t - ix) + Math.sin(t + iy), ny = py + Math.sin(t - iy) + Math.cos(t + ix);
        ix = nx; iy = ny;
        cc += 1 / Math.hypot(px / (Math.sin(ix + t) / 0.005), py / (Math.cos(iy + t) / 0.005));
      }
      cc /= 4;
      const v = Math.max(0, Math.min(1, Math.pow(Math.abs(1.17 - Math.pow(cc, 1.4)), 8)));
      const q = v > 0.55 ? 2 : v > 0.25 + bayer(x, y) * 0.25 ? 1 : 0;
      if (!q) continue;
      const col = q === 2 ? C.glint! : C.foam!;
      const i = (y * size + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = q === 2 ? 255 : 150;
    }
    ctx.putImageData(img, 0, 0);
    out.push(c);
  }
  return out;
}

/** Мягкие текстуры света для режима lighter. */
export function lightTexture(color: RGB, size = 64): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, css(color, 1));
  g.addColorStop(0.35, css(color, 0.45));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

export function rayTexture(C: Colors): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(64, 256);
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, css(C.glint!, 0.8));
  v.addColorStop(0.7, css(C.foam!, 0.15));
  v.addColorStop(1, css(C.foam!, 0));
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 64, 256);
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  return c;
}

export interface Light { x: number; y: number; r: number; tex: HTMLCanvasElement; a: number }

/** Декор дна: водоросли колышутся, жерла пускают пузыри, всё — пиксельными штрихами. */
export class DecorPainter {
  private readonly kelp: RGB[];
  private readonly anem: RGB[];
  private readonly bone: RGB[];
  private readonly peb: RGB[];
  private readonly shell: RGB[];

  constructor(private readonly C: Colors) {
    this.kelp = ramp([70, 130, 60], 5, 0.5);
    this.anem = ramp(C.coralLight!, 5, 0.6);
    this.bone = ramp([214, 206, 182], 4, 0.4);
    this.peb = ramp(C.rock!, 4, 0.5);
    this.shell = ramp([232, 180, 150], 4, 0.4);
  }

  draw(ctx: CanvasRenderingContext2D, list: Decor[], ox: number, oy: number, w: number, h: number, t: number, lights: Light[], warm: HTMLCanvasElement, bubble: (x: number, y: number) => void): void {
    for (const d of list) {
      const x = Math.round(d.x - ox), y = Math.round(d.y - oy);
      if (x < -20 || y < -30 || x > w + 20 || y > h + 10) continue;
      switch (d.kind) {
        case 'kelp': {
          const stalks = 2 + Math.floor(d.s * 3);
          for (let k = 0; k < stalks; k++) {
            const len = 9 + Math.floor(((d.v * 7 + k * 3.7) % 1) * 12);
            const bx = x + (k - stalks / 2) * 2;
            for (let i = 0; i < len; i++) {
              const sway = Math.round(Math.sin(t * 1.6 + d.v * 9 + k + i * 0.25) * (i / len) * 3);
              ctx.fillStyle = css(this.kelp[Math.min(4, 1 + Math.floor((i / len) * 4))]!);
              ctx.fillRect(bx + sway, y - i, 1, 1);
              if (i % 4 === 2) { ctx.fillStyle = css(this.kelp[3]!); ctx.fillRect(bx + sway + (k % 2 ? 1 : -1), y - i, 1, 1); }
            }
          }
          break;
        }
        case 'anemone': {
          ctx.fillStyle = css(this.anem[1]!);
          ctx.fillRect(x - 2, y - 1, 5, 2);
          for (let k = -2; k <= 2; k++) {
            const sway = Math.round(Math.sin(t * 2.2 + d.v * 7 + k) * 1.3);
            ctx.fillStyle = css(this.anem[3]!);
            ctx.fillRect(x + k + sway, y - 3 - (Math.abs(k) < 2 ? 1 : 0), 1, 2);
            ctx.fillStyle = css(this.anem[4]!);
            ctx.fillRect(x + k + sway, y - 4 - (Math.abs(k) < 2 ? 1 : 0), 1, 1);
          }
          break;
        }
        case 'pebble':
          ctx.fillStyle = css(this.peb[0]!); ctx.fillRect(x - 1, y, 3 + Math.floor(d.s * 2), 2);
          ctx.fillStyle = css(this.peb[2]!); ctx.fillRect(x - 1, y - 1, 2 + Math.floor(d.s * 2), 1);
          ctx.fillStyle = css(this.peb[3]!); ctx.fillRect(x - 1, y - 1, 1, 1);
          break;
        case 'shell':
          ctx.fillStyle = css(this.shell[1]!); ctx.fillRect(x - 1, y, 3, 2);
          ctx.fillStyle = css(this.shell[3]!); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
          break;
        case 'bones':
          // рёбра кита
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = css(this.bone[2]!);
            ctx.fillRect(x - 6 + k * 4, y - 4, 1, 5);
            ctx.fillStyle = css(this.bone[3]!);
            ctx.fillRect(x - 6 + k * 4, y - 5, 2, 1);
          }
          ctx.fillStyle = css(this.bone[1]!); ctx.fillRect(x - 7, y + 1, 15, 1);
          break;
        case 'vent': {
          ctx.fillStyle = css(this.C.rockDark!); ctx.fillRect(x - 2, y - 2, 5, 3);
          ctx.fillStyle = css(this.C.ink!); ctx.fillRect(x - 1, y - 2, 3, 1);
          const pulse = 0.5 + 0.5 * Math.sin(t * 3 + d.v * 10);
          ctx.fillStyle = css(this.C.ember!, 0.6 + pulse * 0.4); ctx.fillRect(x, y - 2, 1, 1);
          lights.push({ x: d.x, y: d.y - 2, r: 10 + pulse * 4, tex: warm, a: 0.35 + pulse * 0.25 });
          if (Math.random() < 0.06) bubble(d.x, d.y - 3);
          break;
        }
      }
    }
  }
}
