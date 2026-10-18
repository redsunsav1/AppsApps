import { Geometry, Mesh, Shader } from 'pixi.js';
import type { RenderConfig } from '../data/schema';
import { BIOMES, type MapGrid } from '../sim/map/grid';
import { hexToRgb, type HeightField, type Iso } from './iso';
import { terrainFragment, terrainVertex } from './shaders/terrain';

export interface TerrainView {
  mesh: Mesh<Geometry, Shader>;
  setTime(t: number): void;
}

/** Единый меш дна: вершины в углах тайлов, треугольники отсортированы по глубине изометрии. */
export function buildTerrain(grid: MapGrid, heights: HeightField, iso: Iso, cfg: RenderConfig): TerrainView {
  const W = grid.width, H = grid.h;
  const VW = W + 1, VH = H + 1;
  const nv = VW * VH;
  const pos = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3);
  const world = new Float32Array(nv * 2);
  const params = new Float32Array(nv * 2);

  const biomeRgb = BIOMES.map((b) => hexToRgb(cfg.biomes[b]!.color));
  const biomeCaus = BIOMES.map((b) => cfg.biomes[b]!.caustics);

  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const v = y * VW + x;
      const h = heights.at(x, y);
      pos[v * 2] = iso.x(x, y);
      pos[v * 2 + 1] = iso.y(x, y, h);
      world[v * 2] = x;
      world[v * 2 + 1] = y;

      // цвет — среднее соседних тайлов, отсюда плавные переходы биомов
      let r = 0, g = 0, b = 0, caus = 0, n = 0;
      for (let oy = -1; oy <= 0; oy++) for (let ox = -1; ox <= 0; ox++) {
        const tx = x + ox, ty = y + oy;
        if (!grid.inBounds(tx, ty)) continue;
        const bi = grid.biome[grid.idx(tx, ty)]!;
        r += biomeRgb[bi]![0]; g += biomeRgb[bi]![1]; b += biomeRgb[bi]![2];
        caus += biomeCaus[bi]!;
        n++;
      }
      const jitter = 0.93 + hash2(x, y) * 0.14;
      col[v * 3] = (r / n) * jitter;
      col[v * 3 + 1] = (g / n) * jitter;
      col[v * 3 + 2] = (b / n) * jitter;

      // освещение сверху-слева по градиенту высот; склоны темнее, вершины светлее
      const dx = heights.at(x + 1, y) - heights.at(x - 1, y);
      const dy = heights.at(x, y + 1) - heights.at(x, y - 1);
      const light = 1 - (dx + dy) * 0.32 + Math.max(0, h) * 0.08;
      params[v * 2] = (caus / n) * Math.max(0.2, 1 - Math.max(0, h) * 0.25);
      params[v * 2 + 1] = Math.max(0.35, Math.min(1.5, light));
    }
  }

  // треугольники по диагоналям x+y: дальние раньше ближних (иначе высокие скалы перекрываются неверно)
  const idx = new Uint32Array(W * H * 6);
  let k = 0;
  for (let s = 0; s <= W + H - 2; s++) {
    for (let x = Math.max(0, s - (H - 1)); x <= Math.min(W - 1, s); x++) {
      const y = s - x;
      const a = y * VW + x, b = a + 1, c = a + VW, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c;
      idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
  }

  const geometry = new Geometry({
    attributes: {
      aPosition: { buffer: pos, format: 'float32x2' },
      aColor: { buffer: col, format: 'float32x3' },
      aWorld: { buffer: world, format: 'float32x2' },
      aParams: { buffer: params, format: 'float32x2' },
    },
    indexBuffer: idx,
  });
  const shader = Shader.from({
    gl: { vertex: terrainVertex, fragment: terrainFragment },
    resources: {
      terrainUniforms: {
        uTime: { value: 0, type: 'f32' },
        uCaustics: { value: 0.55, type: 'f32' },
        uTint: { value: new Float32Array([0.02, 0.13, 0.2]), type: 'vec3<f32>' },
      },
    },
  });
  const mesh = new Mesh({ geometry, shader });
  return {
    mesh,
    setTime(t: number) {
      (shader.resources.terrainUniforms as { uniforms: { uTime: number } }).uniforms.uTime = t;
    },
  };
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
