import type { Container } from 'pixi.js';
import type { GameConfig } from '../data/schema';

/** Камера: центр в px мира + зум. Ограничена ромбом карты. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private vw = 1;
  private vh = 1;

  constructor(
    private readonly cfg: GameConfig['camera'],
    private readonly bounds: { minX: number; maxX: number; minY: number; maxY: number },
  ) {}

  resize(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
  }

  get viewW(): number { return this.vw; }
  get viewH(): number { return this.vh; }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  centerOn(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.clamp();
  }

  /** Зум к точке экрана (точка под курсором остаётся на месте). */
  zoomAt(factor: number, sx: number, sy: number): void {
    const [wx, wy] = this.toWorld(sx, sy);
    this.zoom = Math.max(this.cfg.zoomMin, Math.min(this.cfg.zoomMax, this.zoom * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.x += wx - nx;
    this.y += wy - ny;
    this.clamp();
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.vw / 2) / this.zoom + this.x, (sy - this.vh / 2) / this.zoom + this.y];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.vw / 2, (wy - this.y) * this.zoom + this.vh / 2];
  }

  apply(world: Container): void {
    world.scale.set(this.zoom);
    world.position.set(Math.round(this.vw / 2 - this.x * this.zoom), Math.round(this.vh / 2 - this.y * this.zoom));
  }

  private clamp(): void {
    const b = this.bounds;
    this.x = Math.max(b.minX, Math.min(b.maxX, this.x));
    this.y = Math.max(b.minY, Math.min(b.maxY, this.y));
  }
}
