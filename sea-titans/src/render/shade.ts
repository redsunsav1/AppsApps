import type { RGB } from './pixel';

/** Приёмы пиксель-арта: тональные рампы со сдвигом оттенка и упорядоченный дизеринг. */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]!;

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return [f(0), f(8), f(4)];
}

/**
 * Рампа из n оттенков: тени холоднее (к синему), света теплее (к жёлтому) — как у художников 16-bit.
 * index 0 — самый тёмный.
 */
export function ramp(base: RGB, n = 6, spread = 0.62): RGB[] {
  const [h, s, l] = rgbToHsl(base);
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5; // -0.5..0.5
    const nl = Math.max(0.03, Math.min(0.97, l + t * spread));
    const hueShift = t < 0 ? (0.62 - h) * -t * 0.25 : (0.12 - h) * t * 0.18; // к синему / к жёлтому
    out.push(hslToRgb((h + hueShift + 1) % 1, Math.max(0, Math.min(1, s * (1 - Math.abs(t) * 0.35))), nl));
  }
  return out;
}

/** Значение 0..1 → цвет рампы с дизерингом между ступенями. */
export function dither(r: RGB[], v: number, x: number, y: number): RGB {
  const f = Math.max(0, Math.min(0.9999, v)) * (r.length - 1);
  const i = Math.floor(f);
  return f - i > bayer(x, y) ? r[Math.min(r.length - 1, i + 1)]! : r[i]!;
}

/** Освещённость нормали (в экранных осях, z к зрителю): свет сверху-слева-спереди. */
const L = (() => { const v = [-0.5, -0.6, 0.62]; const n = Math.hypot(...v); return v.map((c) => c / n) as [number, number, number]; })();
export function lambert(nx: number, ny: number, nz: number): number {
  const n = Math.hypot(nx, ny, nz) || 1;
  return Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / n);
}

/** Блик (Блинн-Фонг) для металла и стекла. */
export function specular(nx: number, ny: number, nz: number, power = 24): number {
  const hx = L[0], hy = L[1], hz = L[2] + 1;
  const hn = Math.hypot(hx, hy, hz);
  const n = Math.hypot(nx, ny, nz) || 1;
  return Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / (n * hn)), power);
}

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t),
];

/** Гладкий value-noise для текстур (визуал, не симуляция). */
export function vnoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => {
    let v = (a * 374761393 + b * 668265263 + seed * 982451653) | 0;
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
  };
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * sx;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

export function fbm(x: number, y: number, oct = 3, seed = 0): number {
  let s = 0, a = 1, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, seed + i * 31) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}
