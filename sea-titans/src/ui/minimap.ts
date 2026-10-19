import { hasComponent } from 'bitecs';
import type { Fog } from '../render/fog';
import { hexToRgb, pack } from '../render/pixel';
import type { Renderer } from '../render/renderer';
import type { Sprites } from '../render/sprites';
import { Building, Owner, Position } from '../sim/components';
import type { MapGrid } from '../sim/map/grid';
import { nodeQuery, unitQuery, type SimWorld } from '../sim/world';

/** Миникарта 1 пиксель = 1 тайл, увеличена CSS без сглаживания. Клик/перетаскивание — камера. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: Uint32Array;
  private readonly img: ImageData;
  private dragging = false;

  constructor(private readonly grid: MapGrid, private readonly sprites: Sprites, private readonly fog: Fog, private readonly view: Renderer, private readonly player: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = grid.width;
    this.canvas.height = grid.h;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(grid.width, grid.h);
    const C = sprites.colors;
    const biome = [C.sand!, C.water!, C.coral!, C.rock!, C.ash!, C.deep!];
    this.base = new Uint32Array(grid.width * grid.h);
    for (let i = 0; i < this.base.length; i++) this.base[i] = pack(grid.blocked[i] ? C.rockLight! : biome[grid.biome[i]!]!);

    const go = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const tx = ((e.clientX - r.left) / r.width) * grid.width, ty = ((e.clientY - r.top) / r.height) * grid.h;
      this.view.centerOn(tx * 16, ty * 16);
    };
    this.canvas.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.dragging = true; go(e); });
    window.addEventListener('pointermove', (e) => { if (this.dragging) go(e); });
    window.addEventListener('pointerup', () => { this.dragging = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  draw(sim: SimWorld): void {
    const px = new Uint32Array(this.img.data.buffer);
    const black = pack([0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      if (!this.fog.explored[i]) px[i] = black;
      else if (!this.fog.visible[i]) px[i] = ((this.base[i]! >> 1) & 0x7f7f7f7f) | 0xff000000;
      else px[i] = this.base[i]!;
    }
    const W = this.grid.width;
    const put = (x: number, y: number, c: number) => { if (x >= 0 && y >= 0 && x < W && y < this.grid.h) px[y * W + x] = c; };
    const metal = pack(this.sprites.colors.metal!);
    const nodes = nodeQuery(sim.ecs);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const x = Math.floor(Position.x[n]! / 1024), y = Math.floor(Position.y[n]! / 1024);
      if (this.fog.explored[y * W + x]) put(x, y, metal);
    }
    const ents = unitQuery(sim.ecs);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const x = Math.floor(Position.x[e]! / 1024), y = Math.floor(Position.y[e]! / 1024);
      if (Owner.player[e] !== this.player && !this.fog.visible[y * W + x]) continue;
      const c = pack(hexToRgb(sim.reg.palette.teams[Owner.player[e]!]!.main));
      put(x, y, c);
      if (hasComponent(sim.ecs, Building, e)) { put(x + 1, y, c); put(x, y + 1, c); put(x + 1, y + 1, c); put(x - 1, y, c); put(x, y - 1, c); }
    }
    this.ctx.putImageData(this.img, 0, 0);
    // рамка камеры
    const v = this.view;
    this.ctx.strokeStyle = '#f4f4e8';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(Math.round(v.camX / 16) + 0.5, Math.round((v.camY + v.insetTop) / 16) + 0.5, Math.round(v.bw / 16), Math.round((v.bh - v.insetTop - v.insetBottom) / 16));
  }
}
