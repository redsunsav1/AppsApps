import type { RenderConfig } from '../data/schema';
import type { Camera } from '../render/camera';
import type { Iso } from '../render/iso';
import { hexToRgb } from '../render/iso';
import { Owner, Position } from '../sim/components';
import { BIOMES, type MapGrid } from '../sim/map/grid';
import { unitQuery, type SimWorld } from '../sim/world';

/** Миникарта-ромб (как в изометрии), клик/перетаскивание — переход камеры. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg: HTMLCanvasElement;
  private readonly size: number;
  private dragging = false;

  constructor(
    private readonly grid: MapGrid,
    private readonly cfg: RenderConfig,
    private readonly camera: Camera,
    private readonly iso: Iso,
    size = 196,
  ) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;

    // фон: тайлы сверху, затем рисуем повёрнутыми в ромб
    this.bg = document.createElement('canvas');
    this.bg.width = grid.width;
    this.bg.height = grid.h;
    const bctx = this.bg.getContext('2d')!;
    const img = bctx.createImageData(grid.width, grid.h);
    const colors = BIOMES.map((b) => hexToRgb(cfg.biomes[b]!.color));
    for (let i = 0; i < grid.width * grid.h; i++) {
      const c = colors[grid.biome[i]!]!;
      const k = grid.blocked[i] ? 0.7 : 1.25;
      img.data[i * 4] = Math.min(255, c[0] * 255 * k);
      img.data[i * 4 + 1] = Math.min(255, c[1] * 255 * k);
      img.data[i * 4 + 2] = Math.min(255, c[2] * 255 * k);
      img.data[i * 4 + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);

    const go = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const [tx, ty] = this.toTile(e.clientX - r.left, e.clientY - r.top);
      this.camera.centerOn(this.iso.x(tx, ty), this.iso.y(tx, ty));
    };
    this.canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.dragging = true; go(e); });
    window.addEventListener('pointermove', (e) => { if (this.dragging) go(e); });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Тайл → точка миникарты. */
  private toMini(tx: number, ty: number): [number, number] {
    const s = this.size / (this.grid.width + this.grid.h);
    return [this.size / 2 + (tx - ty) * s, (tx + ty) * s * 0.5 + this.size * 0.25];
  }

  private toTile(mx: number, my: number): [number, number] {
    const s = this.size / (this.grid.width + this.grid.h);
    const a = (mx - this.size / 2) / s;
    const b = (my - this.size * 0.25) / (s * 0.5);
    return [(a + b) / 2, (b - a) / 2];
  }

  draw(w: SimWorld): void {
    const ctx = this.ctx;
    const n = this.size;
    ctx.clearRect(0, 0, n, n);
    const s = n / (this.grid.width + this.grid.h);
    // матрица тайл→мини: x' = (tx-ty)s + n/2, y' = (tx+ty)s/2 + n/4
    ctx.save();
    ctx.setTransform(s, s * 0.5, -s, s * 0.5, n / 2, n * 0.25);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0);
    ctx.restore();

    const ents = unitQuery(w.ecs);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const [x, y] = this.toMini(Position.x[e]! / 1024, Position.y[e]! / 1024);
      ctx.fillStyle = this.cfg.teamColors[Owner.player[e]!] ?? '#fff';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    // рамка видимой области
    const corners = [[0, 0], [this.camera.viewW, 0], [this.camera.viewW, this.camera.viewH], [0, this.camera.viewH]] as const;
    ctx.strokeStyle = 'rgba(220,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach(([sx, sy], i) => {
      const [wx, wy] = this.camera.toWorld(sx, sy);
      const [tx, ty] = this.iso.toTile(wx, wy);
      const [mx, my] = this.toMini(tx, ty);
      if (i) ctx.lineTo(mx, my); else ctx.moveTo(mx, my);
    });
    ctx.closePath();
    ctx.stroke();
  }
}
