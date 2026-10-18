import type { AssetEntry, AssetManifest, Palette } from '../data/schema';
import { hexToRgb, makeCanvas, rasterSprite, type RGB } from './pixel';

export interface Colors { [k: string]: RGB }
export interface TeamColors { main: RGB; dark: RGB }

/** Спрайт юнита: 8 направлений (0 — восток, по часовой) для каждой команды. */
export interface SpriteSet {
  size: number;
  /** frames[team][dir][anim] */
  frames: HTMLCanvasElement[][][];
}

export interface Sprites {
  units: Map<string, SpriteSet>;
  crystals: HTMLCanvasElement[];  // 0 — почти пусто, 2 — полное
  colors: Colors;
  teams: TeamColors[];
}

export function loadColors(p: Palette): { colors: Colors; teams: TeamColors[] } {
  const colors: Colors = {};
  for (const [k, v] of Object.entries(p.colors)) colors[k] = hexToRgb(v);
  return { colors, teams: p.teams.map((t) => ({ main: hexToRgb(t.main), dark: hexToRgb(t.dark) })) };
}

/**
 * Все спрайты процедурные: силуэт растеризуется под 8 углов, затем обводка.
 * Пайплайн из ТЗ остаётся: источник в manifest можно заменить на готовый атлас.
 */
export function buildSprites(manifest: AssetManifest, palette: Palette): Sprites {
  const { colors, teams } = loadColors(palette);
  const units = new Map<string, SpriteSet>();
  for (const [id, entry] of Object.entries(manifest)) {
    const frames = teams.map((team) => {
      if (entry.source === 'procedural:hq') return [[0, 1].map((f) => hqSprite(entry.size, colors, team, f))];
      return Array.from({ length: 8 }, (_, d) => {
        const theta = (d / 8) * Math.PI * 2;
        if (entry.source === 'procedural:sub') return [0, 1].map((f) => subSprite(entry, theta, colors, team, f));
        if (entry.source === 'procedural:harvester') return [0, 1].map((f) => harvesterSprite(entry, theta, colors, team, f));
        throw new Error(`Ассет ${id}: неизвестный источник ${entry.source}`);
      });
    });
    units.set(id, { size: entry.size, frames });
  }
  return { units, crystals: [1, 3, 5].map((n) => crystalSprite(n, colors)), colors, teams };
}

const LIGHT = [-0.6, -0.8] as const; // свет сверху-слева

function local(x: number, y: number, size: number, theta: number): [number, number] {
  const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
  const c = Math.cos(theta), s = Math.sin(theta);
  return [dx * c + dy * s, -dx * s + dy * c];
}

function shade(nx: number, ny: number, theta: number): number {
  const c = Math.cos(theta), s = Math.sin(theta);
  const sx = nx * c - ny * s, sy = nx * s + ny * c;
  const l = Math.hypot(sx, sy) || 1;
  return (sx * LIGHT[0] + sy * LIGHT[1]) / l;
}

function subSprite(entry: AssetEntry, theta: number, C: Colors, T: TeamColors, frame: number): HTMLCanvasElement {
  const size = entry.size;
  const L = entry.params?.length ?? 12, W = entry.params?.width ?? 5, tower = entry.params?.tower ?? 3;
  const a = L / 2, b = W / 2;
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = local(x, y, size, theta);
    // винт за кормой мигает — «крутится»
    if (lx < -a + 0.6 && lx > -a - 1.4 && Math.abs(ly) <= Math.max(1, b * 0.55)) return frame ? C.brass! : C.hullDark!;
    const bb = lx < 0 ? b * (0.78 + 0.22 * (1 + lx / a)) : b;
    const e = (lx / a) ** 2 + (ly / bb) ** 2;
    if (e > 1) return null;
    if (lx > a - 1.7 && Math.abs(ly) < 0.9) return C.white!; // прожектор
    const tw = Math.max(1.2, b * 0.55);
    if (((lx + a * 0.08) / (tower * 0.75)) ** 2 + (ly / tw) ** 2 <= 1) return ly < -tw * 0.3 ? T.main : T.dark;
    if (Math.abs(ly) <= 0.7 && lx > -a * 0.75 && lx < a * 0.62) return T.main;
    const d = shade(lx / (a * a), ly / (bb * bb), theta);
    return d > 0.45 ? C.hullLight! : d < -0.35 ? C.hullDark! : C.hull!;
  }, C.ink!);
}

function harvesterSprite(entry: AssetEntry, theta: number, C: Colors, T: TeamColors, frame: number): HTMLCanvasElement {
  const size = entry.size;
  const L = entry.params?.length ?? 11, W = entry.params?.width ?? 8;
  const a = L / 2, b = W / 2;
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = local(x, y, size, theta);
    // клешни спереди, раскрываются в кадре 1
    const open = frame ? 0.6 : 0;
    if (lx > a - 0.5 && lx < a + 2 && Math.abs(Math.abs(ly) - (b - 1.6 + open)) < 0.9) return C.hullDark!;
    if (Math.abs(lx) > a || Math.abs(ly) > b || Math.abs(lx) + Math.abs(ly) > a + b - 1.6) return null;
    if (lx > a - 3.5) return Math.abs(ly) < 1.2 && lx > a - 2.5 ? C.glint! : T.main; // кабина
    if (Math.abs(ly) > b - 1.3) return ly < 0 ? C.hullLight! : C.hullDark!;      // гусеницы
    return Math.floor(lx + ly + 20) % 3 === 0 ? C.ink! : C.hazard!;               // жёлто-чёрная полоса
  }, C.ink!);
}

function hqSprite(size: number, C: Colors, T: TeamColors, frame: number): HTMLCanvasElement {
  const h = size / 2;
  return rasterSprite(size, (x, y) => {
    const dx = x + 0.5 - h, dy = y + 0.5 - h;
    const r = Math.hypot(dx, dy);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // огни на опорах
    if (Math.abs(ax - h * 0.72) < 1.5 && Math.abs(ay - h * 0.72) < 1.5) return (frame + (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0)) % 2 ? C.ember! : C.lava!;
    if (ax > h - 1 || ay > h - 1 || ax + ay > h * 1.38) return null;
    if (r <= h * 0.5) {
      if (dx + dy < -h * 0.35 && r > h * 0.18) return C.white!;
      if (dx + dy < -h * 0.1) return T.main;
      return T.dark;
    }
    if (r <= h * 0.68) return dx + dy < 0 ? C.hullLight! : C.hull!;
    // настил с панелями
    if ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0) return C.hullDark!;
    return C.rockDark!;
  }, C.ink!);
}

function crystalSprite(count: number, C: Colors): HTMLCanvasElement {
  const spots: [number, number, number, number][] = [
    [8, 9, 2.6, 5], [4.5, 11, 1.8, 3.5], [11.5, 11, 2, 3.8], [6, 6, 1.6, 3], [11, 6, 1.4, 2.6],
  ];
  const use = spots.slice(0, count);
  return rasterSprite(16, (x, y) => {
    for (const [cx, cy, w, h] of use) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (Math.abs(dx) / w + Math.abs(dy) / h > 1) continue;
      if (dy < -h * 0.45 && dx < 0.5) return C.white!;
      return dx < 0 ? C.metal! : C.metalDark!;
    }
    return null;
  }, C.ink!);
}

/** Иконка для HUD: кадр «восток» в увеличении. */
export function iconOf(set: SpriteSet, team: number, scale: number): HTMLCanvasElement {
  const src = set.frames[team]![set.frames[team]!.length > 1 ? 0 : 0]![0]!;
  const [c, ctx] = makeCanvas(set.size * scale, set.size * scale);
  ctx.drawImage(src, 0, 0, set.size * scale, set.size * scale);
  return c;
}
