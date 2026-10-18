import type { AssetEntry, AssetManifest, Palette } from '../data/schema';
import { hexToRgb, makeCanvas, rasterSprite, type RGB } from './pixel';
import { dither, lambert, mix, ramp, specular } from './shade';

export interface Colors { [k: string]: RGB }
export interface TeamColors { main: RGB; dark: RGB; ramp: RGB[] }

/** Спрайт юнита: 8 направлений (0 — восток, по часовой) × 2 кадра для каждой команды. */
export interface SpriteSet {
  size: number;
  length: number;
  /** frames[team][dir][anim] */
  frames: HTMLCanvasElement[][][];
  /** Отдельная башня (крейсер): turret[team][dir16], смещение по оси корпуса в px. */
  turret?: HTMLCanvasElement[][];
  turretOffset: number;
  /** Где у корпуса двигатель (px от центра назад) — для свечения и пузырей. */
  stern: number;
  engine: RGB;
}

export interface Sprites {
  units: Map<string, SpriteSet>;
  crystals: HTMLCanvasElement[];
  colors: Colors;
  teams: TeamColors[];
}

export function loadColors(p: Palette): { colors: Colors; teams: TeamColors[] } {
  const colors: Colors = {};
  for (const [k, v] of Object.entries(p.colors)) colors[k] = hexToRgb(v);
  return { colors, teams: p.teams.map((t) => ({ main: hexToRgb(t.main), dark: hexToRgb(t.dark), ramp: ramp(hexToRgb(t.main), 6, 0.7) })) };
}

interface Mats { hull: RGB[]; dark: RGB[]; glass: RGB[]; brass: RGB[]; hazard: RGB[]; team: RGB[]; C: Colors }

/**
 * Процедурный пиксель-арт: каждая деталь — объём с нормалью, свет сверху-слева,
 * тона из рамп с дизерингом, тёмная обводка по контуру. Источник в manifest можно заменить на атлас.
 */
export function buildSprites(manifest: AssetManifest, palette: Palette): Sprites {
  const { colors: C, teams } = loadColors(palette);
  const base = {
    hull: ramp(C.hull!, 7, 0.75), dark: ramp(C.hullDark!, 6, 0.5), glass: ramp(C.foam!, 6, 0.8),
    brass: ramp(C.brass!, 5, 0.6), hazard: ramp(C.hazard!, 6, 0.6), C,
  };
  const units = new Map<string, SpriteSet>();
  for (const [id, entry] of Object.entries(manifest)) {
    const p = entry.params ?? {};
    const set: SpriteSet = { size: entry.size, length: p.length ?? entry.size * 0.8, frames: [], turretOffset: 0, stern: (p.length ?? entry.size) / 2, engine: C.foam! };
    set.frames = teams.map((team) => {
      const m: Mats = { ...base, team: team.ramp };
      if (entry.source === 'procedural:hq') return [[0, 1].map((f) => hq(entry.size, m, f))];
      return Array.from({ length: 8 }, (_, d) => [0, 1].map((f) => draw(entry, (d / 8) * Math.PI * 2, m, f)));
    });
    if (entry.source === 'procedural:cruiser') {
      set.turretOffset = (p.length ?? 30) * 0.14;
      set.turret = teams.map((team) => Array.from({ length: 16 }, (_, d) => turret((d / 16) * Math.PI * 2, { ...base, team: team.ramp })));
      set.engine = C.ember!;
    }
    if (entry.source === 'procedural:harvester') set.engine = C.ember!;
    units.set(id, set);
  }
  return { units, crystals: [2, 4, 6].map((n) => crystal(n, C)), colors: C, teams };
}

function draw(entry: AssetEntry, theta: number, m: Mats, f: number): HTMLCanvasElement {
  switch (entry.source) {
    case 'procedural:scout': return scout(entry, theta, m, f);
    case 'procedural:hunter': return hunter(entry, theta, m, f);
    case 'procedural:cruiser': return cruiser(entry, theta, m, f);
    case 'procedural:harvester': return harvester(entry, theta, m, f);
    default: throw new Error(`Неизвестный источник спрайта ${entry.source}`);
  }
}

/** Пиксель → локальные оси корпуса (нос по +x) и обратный поворот нормали в экран. */
function frame(size: number, theta: number) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return {
    local: (x: number, y: number): [number, number] => {
      const dx = x + 0.5 - size / 2, dy = y + 0.5 - size / 2;
      return [dx * c + dy * s, -dx * s + dy * c];
    },
    light: (nlx: number, nly: number, nz: number, spec = 0): number => {
      const sx = nlx * c - nly * s, sy = nlx * s + nly * c;
      return 0.1 + 0.85 * lambert(sx, sy, nz) + (spec ? specular(sx, sy, nz, spec) * 0.6 : 0);
    },
  };
}

/** Эллипсоид: null вне, иначе нормаль (локальная). */
function ellipsoid(lx: number, ly: number, a: number, b: number, h = b * 0.9): [number, number, number] | null {
  const e = (lx / a) ** 2 + (ly / b) ** 2;
  if (e > 1) return null;
  const z = Math.sqrt(1 - e);
  return [lx / (a * a), ly / (b * b), z / h];
}

function scout(entry: AssetEntry, theta: number, m: Mats, f: number): HTMLCanvasElement {
  const size = entry.size, L = entry.params?.length ?? 20, W = entry.params?.width ?? 8;
  const a = L / 2, b = W / 2;
  const F = frame(size, theta);
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = F.local(x, y);
    // спаренные лазеры на носу, светящиеся кончики
    if (lx > a * 0.1 && lx < a + 2.5 && Math.abs(Math.abs(ly) - b * 0.85) < 0.65) return lx > a + 1.2 ? m.C.glint! : dither(m.dark, 0.35 + (ly < 0 ? 0.3 : 0), x, y);
    // стреловидные плавники в цвет команды
    const finW = b + Math.max(0, (-lx - a * 0.15) * 0.95);
    if (lx < -a * 0.1 && lx > -a * 0.95 && Math.abs(ly) <= finW && Math.abs(ly) > b * 0.45) {
      return dither(m.team, F.light(0, ly > 0 ? 0.3 : -0.3, 1) + (Math.abs(ly) > finW - 1 ? 0.15 : 0), x, y);
    }
    // двигатель
    if (lx < -a + 1.6 && lx > -a - 1 && Math.abs(ly) < b * 0.55) return f ? m.C.glint! : m.C.foam!;
    const bb = b * Math.max(0.35, 1 - ((lx - a * 0.1) / (a * 1.15)) ** 2);
    const n = ellipsoid(lx, ly, a, bb);
    if (!n) return null;
    // кабина-фонарь
    const cn = ellipsoid(lx - a * 0.3, ly, a * 0.3, bb * 0.62, bb * 0.7);
    if (cn) return dither(m.glass, F.light(cn[0], cn[1], cn[2] * 1.4, 30), x, y);
    if (Math.abs(ly) < 0.6 && lx > -a * 0.6 && lx < a * 0.05) return dither(m.team, F.light(...n) + 0.1, x, y);
    return dither(m.hull, F.light(n[0], n[1], n[2], 20), x, y);
  }, m.C.ink!);
}

function hunter(entry: AssetEntry, theta: number, m: Mats, f: number): HTMLCanvasElement {
  const size = entry.size, L = entry.params?.length ?? 24, W = entry.params?.width ?? 10, tw = entry.params?.tower ?? 5;
  const a = L / 2, b = W / 2;
  const F = frame(size, theta);
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = F.local(x, y);
    // винт: лопасти меняют положение — «крутится»
    if (lx < -a + 0.8 && lx > -a - 2.2 && Math.abs(ly) < b * 0.75) {
      const blade = f ? Math.abs(ly) < 0.9 : Math.abs(ly) > b * 0.35;
      return blade ? dither(m.brass, 0.4 + (ly < 0 ? 0.35 : 0), x, y) : null;
    }
    const bb = lx < 0 ? b * (0.72 + 0.28 * (1 + lx / a)) : b;
    const n = ellipsoid(lx, ly, a, bb);
    if (!n) return null;
    // рубка — отдельный объём в цвет команды
    const tn = ellipsoid(lx + a * 0.08, ly, tw * 0.95, b * 0.48, b * 0.6);
    if (tn) {
      if (Math.abs(lx + a * 0.08 - tw * 0.4) < 0.7 && Math.abs(ly) < 0.7) return m.C.white!; // перископ
      return dither(m.team, F.light(tn[0], tn[1], tn[2] * 1.3, 18) + 0.08, x, y);
    }
    // торпедные аппараты
    if (lx > a - 2.6 && Math.abs(Math.abs(ly) - 1.6) < 0.7) return m.C.ink!;
    // иллюминаторы светятся тёплым
    for (const px of [a * 0.45, a * 0.2, -a * 0.4]) if ((lx - px) ** 2 + (Math.abs(ly) - bb * 0.6) ** 2 < 0.8) return m.C.ember!;
    let v = F.light(n[0], n[1], n[2], 22);
    if (Math.abs(((lx + a) % 5) - 2.5) > 2.1) v -= 0.12; // швы обшивки
    if (lx > a * 0.55 && lx < a * 0.72) return dither(m.team, v, x, y);
    return dither(m.hull, v, x, y);
  }, m.C.ink!);
}

function cruiser(entry: AssetEntry, theta: number, m: Mats, f: number): HTMLCanvasElement {
  const size = entry.size, L = entry.params?.length ?? 34, W = entry.params?.width ?? 16;
  const a = L / 2, b = W / 2;
  const F = frame(size, theta);
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = F.local(x, y);
    // два двигателя на корме
    if (lx < -a + 2.2 && lx > -a - 1.2 && Math.abs(Math.abs(ly) - b * 0.42) < 1.3) return f ? m.C.ember! : m.C.lava!;
    // острый нос, тупая корма
    const e = Math.abs(lx / a) ** (lx > 0 ? 1.6 : 4) + (ly / b) ** 2;
    if (e > 1) return null;
    const z = Math.sqrt(1 - e);
    const n: [number, number, number] = [lx / (a * a) * 1.4, ly / (b * b), z / (b * 0.8)];
    let v = F.light(n[0], n[1], n[2], 18);
    // мостик
    if (lx > -a * 0.62 && lx < -a * 0.22 && Math.abs(ly) < b * 0.4) {
      if (Math.abs(lx + a * 0.3) < 0.8 && Math.abs(ly) < b * 0.3) return m.C.glint!; // окна мостика
      return dither(m.hull, F.light(0, 0, 1) + 0.15, x, y);
    }
    // площадка под башню (башня рисуется отдельно)
    if ((lx - a * 0.14) ** 2 + ly ** 2 < 16) return dither(m.dark, 0.3, x, y);
    // бортовая броня в цвет команды
    if (Math.abs(ly) > b * 0.6 && Math.abs(ly) < b * 0.82 && lx > -a * 0.7 && lx < a * 0.55) return dither(m.team, v, x, y);
    // палубные плиты
    const panel = (Math.floor((lx + a) / 4) + Math.floor((ly + b) / 4)) % 2;
    if (Math.abs(((lx + a) % 4)) < 0.5 || Math.abs(((ly + b) % 4)) < 0.5) v -= 0.15;
    return dither(m.hull, v + (panel ? 0.05 : -0.03), x, y);
  }, m.C.ink!);
}

function turret(theta: number, m: Mats): HTMLCanvasElement {
  const size = 24;
  const F = frame(size, theta);
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = F.local(x, y);
    // спаренные стволы с дульным тормозом
    if (lx > 1 && lx < 11 && Math.abs(Math.abs(ly) - 1.4) < 0.85) {
      if (lx > 9.5) return dither(m.dark, 0.2, x, y);
      return dither(m.hull, F.light(0, Math.abs(ly) > 1.4 === ly > 0 ? 0.6 : -0.6, 1, 10), x, y);
    }
    const n = ellipsoid(lx, ly, 4.6, 4.2, 3.5);
    if (!n) return null;
    if (lx < -1.5 && Math.abs(ly) < 1.2) return dither(m.team, F.light(...n) + 0.1, x, y);
    return dither(m.hull, F.light(n[0], n[1], n[2], 16), x, y);
  }, m.C.ink!);
}

function harvester(entry: AssetEntry, theta: number, m: Mats, f: number): HTMLCanvasElement {
  const size = entry.size, L = entry.params?.length ?? 20, W = entry.params?.width ?? 14;
  const a = L / 2, b = W / 2;
  const F = frame(size, theta);
  return rasterSprite(size, (x, y) => {
    const [lx, ly] = F.local(x, y);
    // клешни: в кадре 1 раскрыты
    const open = f ? 1.2 : 0;
    if (lx > a - 1 && lx < a + 3.5 && Math.abs(Math.abs(ly) - (b - 2.2 + open)) < 1) return dither(m.dark, lx > a + 2 ? 0.75 : 0.45, x, y);
    // корпус с фаской: нормаль из расстояния до края
    const r = 3;
    const qx = Math.abs(lx) - (a - r), qy = Math.abs(ly) - (b - r);
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    if (outside > 0) return null;
    const edge = -outside; // 0 у края
    const bev = Math.max(0, 1 - edge / 2.2);
    const nlx = qx > qy ? Math.sign(lx) * bev : 0, nly = qy >= qx ? Math.sign(ly) * bev : 0;
    const v = F.light(nlx, nly, 1 - bev * 0.6, 12);
    // кабина
    const cab = ellipsoid(lx - a * 0.35, ly + b * 0.4, 2.8, 2.6, 2.2);
    if (cab) return dither(m.glass, F.light(cab[0], cab[1], cab[2] * 1.5, 28), x, y);
    // предупреждающие полосы спереди
    if (lx > a - 4.2 && edge > 0.6) return (Math.floor(lx + ly + 40) % 4) < 2 ? dither(m.hazard, v, x, y) : dither(m.dark, v * 0.6, x, y);
    // грузовой отсек — тёмная решётка
    if (lx < a * 0.1 && lx > -a + 2 && Math.abs(ly) < b - 2.6) return (Math.floor(lx + 40) % 3 === 0 || Math.floor(ly + 40) % 3 === 0) ? dither(m.dark, 0.45, x, y) : m.C.ink!;
    if (lx < -a + 1.8) return dither(m.team, v, x, y);
    return dither(m.hazard, v, x, y);
  }, m.C.ink!);
}

function hq(size: number, m: Mats, f: number): HTMLCanvasElement {
  const h = size / 2;
  return rasterSprite(size, (x, y) => {
    const dx = x + 0.5 - h, dy = y + 0.5 - h;
    const r = Math.hypot(dx, dy);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    // маяк на мачте
    if (Math.hypot(dx - h * 0.55, dy + h * 0.62) < 1.6) return f ? m.C.white! : m.C.lava!;
    if (Math.abs(dx - h * 0.55) < 0.6 && dy > -h * 0.62 && dy < -h * 0.4) return dither(m.dark, 0.5, x, y);
    // опоры с огнями
    const pd = Math.hypot(ax - h * 0.7, ay - h * 0.7);
    if (pd < 4) {
      if (pd < 1.4) return (f + (dx > 0 ? 1 : 0) + (dy > 0 ? 1 : 0)) % 2 ? m.C.ember! : m.C.lava!;
      return dither(m.dark, 0.25 + lambert(-(ax - h * 0.7) * Math.sign(dx), -(ay - h * 0.7) * Math.sign(dy), 2.5) * 0.7, x, y);
    }
    if (ax > h - 3 || ay > h - 3 || ax + ay > h * 1.32) return null;
    // купол: стекло с отражением цвета команды
    if (r <= h * 0.42) {
      const z = Math.sqrt(1 - (r / (h * 0.42)) ** 2);
      const v = 0.12 + 0.8 * lambert(dx, dy, z * h * 0.5) + specular(dx, dy, z * h * 0.5, 40) * 0.9;
      const glass = dither(m.glass, v, x, y);
      return mix(glass, dither(m.team, v, x, y), 0.45);
    }
    if (r <= h * 0.54) return dither(m.team, 0.25 + lambert(dx, dy, 3) * 0.75, x, y);
    // разметка посадочной площадки
    if (r > h * 0.7 && r < h * 0.76 && Math.floor((Math.atan2(dy, dx) + Math.PI) * 6) % 2 === 0) return m.C.hazard!;
    const bev = Math.max(0, 1 - (h * 1.32 - ax - ay) / 3);
    const v = 0.3 + 0.55 * lambert(Math.sign(dx) * bev, Math.sign(dy) * bev, 1);
    const plate = (Math.floor(x / 6) + Math.floor(y / 6)) % 2 ? 0.05 : -0.04;
    const seam = x % 6 === 0 || y % 6 === 0 ? -0.12 : 0;
    return dither(m.dark, v + plate + seam, x, y);
  }, m.C.ink!);
}

/** Кристаллы металла: призмы с гранями, светлой левой стороной и бликом на вершине. */
function crystal(count: number, C: Colors): HTMLCanvasElement {
  const spots: [number, number, number, number][] = [
    [10, 12, 3.2, 7], [5.5, 14, 2.2, 4.5], [14.5, 14, 2.4, 5], [7, 8, 2, 4], [13.5, 8.5, 1.8, 3.6], [10, 16.5, 2.6, 3],
  ];
  const r = ramp(C.metalDark!, 6, 0.8);
  return rasterSprite(20, (x, y) => {
    for (const [cx, cy, w, h] of spots.slice(0, count)) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (Math.abs(dx) / w + Math.abs(dy) / h > 1) continue;
      if (dy < -h * 0.55 && Math.abs(dx) < w * 0.4) return C.white!;
      return dither(r, dx < 0 ? 0.78 - dy / h * 0.1 : 0.35 - dy / h * 0.1, x, y);
    }
    // каменное основание
    const by = y - 16;
    if (by > 0 && by < 3.5 && Math.abs(x - 10) < 8 - by) return dither(ramp(C.rock!, 4, 0.5), 0.4 - by * 0.08, x, y);
    return null;
  }, C.ink!);
}

/** Иконка юнита для HUD: кадр «восток», увеличенный без сглаживания. */
export function iconOf(set: SpriteSet, team: number, scale: number): HTMLCanvasElement {
  const src = set.frames[team]![0]![0]!;
  const [c, ctx] = makeCanvas(set.size * scale, set.size * scale);
  ctx.drawImage(src, 0, 0, set.size * scale, set.size * scale);
  if (set.turret) ctx.drawImage(set.turret[team]![0]!, (set.size / 2 + set.turretOffset - 12) * scale, (set.size / 2 - 12) * scale, 24 * scale, 24 * scale);
  return c;
}
