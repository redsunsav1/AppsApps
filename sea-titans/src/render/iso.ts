import type { MapGrid } from '../sim/map/grid';

/** Проекция 2:1. Логика живёт в декартовых тайлах, изометрия существует только здесь. */
export class Iso {
  readonly hw: number;
  readonly hh: number;

  constructor(tileWidth: number, tileHeight: number, readonly heightPx: number) {
    this.hw = tileWidth / 2;
    this.hh = tileHeight / 2;
  }

  x(tx: number, ty: number): number {
    return (tx - ty) * this.hw;
  }

  y(tx: number, ty: number, h = 0): number {
    return (tx + ty) * this.hh - h * this.heightPx;
  }

  /** Экранные px мира → тайлы на нулевой высоте. */
  toTile(px: number, py: number): [number, number] {
    const a = px / this.hw;
    const b = py / this.hh;
    return [(a + b) / 2, (b - a) / 2];
  }
}

/** Высоты в углах тайлов — общие для меша рельефа и посадки юнитов на дно. */
export class HeightField {
  readonly w: number;
  readonly h: number;
  readonly v: Float32Array;

  constructor(grid: MapGrid) {
    this.w = grid.width + 1;
    this.h = grid.h + 1;
    this.v = new Float32Array(this.w * this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        let sum = 0, n = 0;
        for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) {
          const tx = x + ox, ty = y + oy;
          if (!grid.inBounds(tx, ty)) continue;
          sum += grid.height[grid.idx(tx, ty)]!;
          n++;
        }
        this.v[y * this.w + x] = n ? sum / n : 0;
      }
    }
  }

  at(x: number, y: number): number {
    x = Math.max(0, Math.min(this.w - 1, x));
    y = Math.max(0, Math.min(this.h - 1, y));
    return this.v[y * this.w + x]!;
  }

  sample(tx: number, ty: number): number {
    const x0 = Math.floor(tx), y0 = Math.floor(ty);
    const fx = tx - x0, fy = ty - y0;
    const a = this.at(x0, y0) + (this.at(x0 + 1, y0) - this.at(x0, y0)) * fx;
    const b = this.at(x0, y0 + 1) + (this.at(x0 + 1, y0 + 1) - this.at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  }
}

export const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

export const hexToNum = (hex: string): number => parseInt(hex.slice(1), 16);
