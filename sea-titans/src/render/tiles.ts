import { BIOME_INDEX, type MapGrid } from '../sim/map/grid';
import { hash3, makeCanvas, pack, type RGB } from './pixel';
import { dither, fbm, mix, ramp } from './shade';
import type { Colors } from './sprites';

const B = BIOME_INDEX;

export interface MapArt {
  /** Дно целиком, рисуется один раз. */
  base: HTMLCanvasElement;
  /** Светящиеся пиксели (лава, биолюминесценция) — рисуются поверх с пульсацией в режиме lighter. */
  glow: HTMLCanvasElement;
  decor: Decor[];
}

export interface Decor { kind: 'kelp' | 'anemone' | 'pebble' | 'shell' | 'bones' | 'vent'; x: number; y: number; s: number; v: number }

/**
 * Дно: шумовые текстуры с тональными рампами и дизерингом, границы биомов «плывут»
 * через смещение шумом (органичные края), скалы с бликом, мхом, обрывом и тенью у подножия.
 */
export function renderMap(grid: MapGrid, C: Colors, T: number): MapArt {
  const W = grid.width * T, H = grid.h * T;
  const [base, ctx] = makeCanvas(W, H);
  const [glow, gctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const gimg = gctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const gp = new Uint32Array(gimg.data.buffer);

  const R = {
    sand: ramp(C.sand!, 7, 0.55), silt: ramp(C.water!, 7, 0.5), abyss: ramp(C.deep!, 6, 0.35), ash: ramp(C.ash!, 6, 0.45),
    rock: ramp(C.rock!, 8, 0.8), moss: ramp([58, 104, 70], 5, 0.45), cliff: ramp(C.rockDark!, 6, 0.5),
    coral: [ramp(C.coral!, 6, 0.6), ramp([224, 120, 48], 6, 0.6), ramp([140, 70, 170], 6, 0.6)],
  };
  const rockAt = (tx: number, ty: number) => !grid.inBounds(tx, ty) || grid.blocked[grid.idx(tx, ty)] === 1;
  const biomeAt = (tx: number, ty: number) => (grid.inBounds(tx, ty) ? grid.biome[grid.idx(tx, ty)]! : B.rock);

  for (let wy = 0; wy < H; wy++) {
    for (let wx = 0; wx < W; wx++) {
      const tx = (wx / T) | 0, ty = (wy / T) | 0;
      const lx = wx - tx * T, ly = wy - ty * T;
      const n1 = fbm(wx / 18, wy / 18, 3), n2 = fbm(wx / 5, wy / 5, 2, 7);
      let c: RGB;
      if (rockAt(tx, ty)) {
        c = rockTexel(wx, wy, lx, ly, tx, ty, T, n1, n2, rockAt, R);
      } else {
        // органичная граница: биом берём со смещённой шумом точки
        const ox = (fbm(wx / 11, wy / 11, 2, 3) - 0.5) * 14, oy = (fbm(wx / 11, wy / 11, 2, 4) - 0.5) * 14;
        const sx = Math.floor((wx + ox) / T), sy = Math.floor((wy + oy) / T);
        const b = rockAt(sx, sy) ? biomeAt(tx, ty) : biomeAt(sx, sy);
        const t = groundTexel(b, wx, wy, n1, n2, R, C, gp, W);
        c = t;
        // тень у подножия скал (снизу и справа от скалы) — мягкая, дизерингом
        let ao = 0;
        if (rockAt(tx, ty - 1)) ao = Math.max(ao, 1 - ly / 7);
        if (rockAt(tx - 1, ty)) ao = Math.max(ao, (1 - lx / 5) * 0.7);
        if (rockAt(tx - 1, ty - 1) && lx < 4 && ly < 4) ao = Math.max(ao, 0.5);
        if (ao > 0 && ao * 0.75 > hash3(wx, wy, 5) * 0.9) c = mix(c, C.ink!, 0.55);
      }
      px[wy * W + wx] = pack(c);
    }
  }
  ctx.putImageData(img, 0, 0);
  gctx.putImageData(gimg, 0, 0);
  return { base, glow, decor: scatterDecor(grid, T) };
}

type Ramps = { [k: string]: RGB[] | RGB[][] };

function groundTexel(b: number, wx: number, wy: number, n1: number, n2: number, R: Ramps, C: Colors, glow: Uint32Array, W: number): RGB {
  const h = hash3(wx, wy);
  switch (b) {
    case B.sand: {
      const ripple = Math.sin((wy + Math.sin(wx / 9) * 3 + n1 * 6) / 2.1) * 0.06;
      if (h < 0.0025) return C.sandLight!;
      return dither(R.sand as RGB[], 0.3 + n1 * 0.32 + n2 * 0.14 + ripple, wx, wy);
    }
    case B.abyss: {
      if (h < 0.0018) { glow[wy * W + wx] = pack(C.glint!); return C.glint!; } // биолюминесценция
      return dither(R.abyss as RGB[], 0.2 + n1 * 0.35 + n2 * 0.1, wx, wy);
    }
    case B.volcanic: {
      const crack = Math.abs(fbm(wx / 10, wy / 10, 3, 5) - 0.5);
      if (crack < 0.018) { const col = crack < 0.008 ? C.ember! : C.lava!; glow[wy * W + wx] = pack(col); return col; }
      return dither(R.ash as RGB[], 0.22 + n1 * 0.35 + n2 * 0.2 + (crack < 0.05 ? 0.15 : 0), wx, wy);
    }
    case B.coral: {
      // кораллы — кустики-сферы трёх цветов на илистом дне
      const cell = 8;
      const cx = Math.floor(wx / cell), cy = Math.floor(wy / cell);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const kx = cx + ox, ky = cy + oy;
        if (hash3(kx, ky, 41) > 0.55) continue;
        const bx = kx * cell + hash3(kx, ky, 42) * cell, by = ky * cell + hash3(kx, ky, 43) * cell;
        const r = 2 + hash3(kx, ky, 44) * 2.6;
        const dx = wx + 0.5 - bx, dy = wy + 0.5 - by;
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        const z = Math.sqrt(1 - d2 / (r * r));
        const v = 0.2 + 0.75 * Math.max(0, (-dx * 0.5 - dy * 0.6) / r + z * 0.62);
        const variant = (R.coral as RGB[][])[Math.floor(hash3(kx, ky, 45) * 3)]!;
        // точки-полипы
        if (hash3(wx, wy, 46) < 0.08) return variant[variant.length - 1]!;
        return dither(variant, v, wx, wy);
      }
      return dither(R.silt as RGB[], 0.28 + n1 * 0.3 + n2 * 0.12, wx, wy);
    }
    default:
      if (h < 0.004) return dither(R.silt as RGB[], 0.05, wx, wy);
      return dither(R.silt as RGB[], 0.3 + n1 * 0.3 + n2 * 0.14, wx, wy);
  }
}

function rockTexel(
  wx: number, wy: number, lx: number, ly: number, tx: number, ty: number, T: number, n1: number, n2: number,
  rockAt: (x: number, y: number) => boolean, R: Ramps,
): RGB {
  const openS = !rockAt(tx, ty + 1), openN = !rockAt(tx, ty - 1), openE = !rockAt(tx + 1, ty), openW = !rockAt(tx - 1, ty);
  const cliffH = 7;
  // южный обрыв: вертикальные прожилки, темнее книзу
  if (openS && ly >= T - cliffH) {
    const k = (ly - (T - cliffH)) / cliffH;
    const streak = (Math.floor(wx / 2) + Math.floor(hash3(Math.floor(wx / 2), ty) * 3)) % 3 === 0 ? -0.12 : 0;
    return dither(R.cliff as RGB[], 0.6 - k * 0.5 + streak + n2 * 0.1, wx, wy);
  }
  let v = 0.42 + n1 * 0.28 + n2 * 0.18;
  if (openN && ly < 3) v += 0.3 - ly * 0.08;          // освещённая кромка
  if (openW && lx < 2) v += 0.18;
  if (openE && lx >= T - 2) v -= 0.25;
  // трещины
  if (Math.abs(fbm(wx / 7, wy / 7, 2, 21) - 0.5) < 0.025) v -= 0.3;
  // мох
  if (fbm(wx / 6, wy / 6, 2, 9) > 0.66 && !(openS && ly >= T - cliffH - 1)) return dither(R.moss as RGB[], 0.3 + n2 * 0.5, wx, wy);
  return dither(R.rock as RGB[], v, wx, wy);
}

function scatterDecor(grid: MapGrid, T: number): Decor[] {
  const out: Decor[] = [];
  for (let ty = 0; ty < grid.h; ty++) for (let tx = 0; tx < grid.width; tx++) {
    const i = grid.idx(tx, ty);
    if (grid.blocked[i]) continue;
    const b = grid.biome[i]!;
    const h = hash3(tx, ty, 77);
    const nearRock = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid.isBlocked(tx + dx!, ty + dy!));
    const x = tx * T + 2 + hash3(tx, ty, 78) * (T - 4), y = ty * T + 4 + hash3(tx, ty, 79) * (T - 6);
    const s = hash3(tx, ty, 80), v = hash3(tx, ty, 81);
    if (b === B.volcanic) { if (h < 0.06) out.push({ kind: 'vent', x, y, s, v }); continue; }
    if ((b === B.silt || b === B.coral) && h < (nearRock ? 0.32 : 0.05)) out.push({ kind: 'kelp', x, y, s, v });
    else if (b === B.coral && h < 0.12) out.push({ kind: 'anemone', x, y, s, v });
    else if (b === B.sand && h < 0.035) out.push({ kind: 'shell', x, y, s, v });
    else if ((b === B.sand || b === B.abyss) && h < 0.042) out.push({ kind: 'bones', x, y, s, v });
    else if (h < 0.07) out.push({ kind: 'pebble', x, y, s, v });
  }
  return out;
}
