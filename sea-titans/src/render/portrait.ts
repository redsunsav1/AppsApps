import type { PilotLook } from '../data/schema';
import { hexToRgb, makeCanvas, rasterSprite, type RGB } from './pixel';
import { dither, lambert, mix, ramp, specular } from './shade';
import type { Colors } from './sprites';

export const PORTRAIT = 48;

/** Кадры: 0 — обычный, 1 — моргнул, 2 — рот открыт, 3 — рот приоткрыт. */
export type PortraitFrames = HTMLCanvasElement[];

/**
 * Процедурный портрет пилота 48×48: кабина на фоне, голова-объём со светом,
 * причёска, снаряжение и особые приметы из data/pilots.json. Сверху — «экран связи» со сканлайнами.
 */
export function buildPortrait(look: PilotLook, team: RGB, C: Colors, enemy: boolean): PortraitFrames {
  const bg = background(C, team, enemy);
  return [0, 1, 2, 3].map((f) => {
    const [c, ctx] = makeCanvas(PORTRAIT, PORTRAIT);
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(character(look, team, C, f), 0, 0);
    // сканлайны и лёгкая виньетка экрана связи
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < PORTRAIT; y += 2) ctx.fillRect(0, y, PORTRAIT, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, PORTRAIT, 1); ctx.fillRect(0, PORTRAIT - 1, PORTRAIT, 1); ctx.fillRect(0, 0, 1, PORTRAIT); ctx.fillRect(PORTRAIT - 1, 0, 1, PORTRAIT);
    return c;
  });
}

function background(C: Colors, team: RGB, enemy: boolean): HTMLCanvasElement {
  const deep = ramp(enemy ? [60, 20, 30] : C.deep!, 6, 0.4);
  const water = ramp(C.shallow!, 5, 0.6);
  const metal = ramp(C.hullDark!, 5, 0.5);
  return rasterSprite(PORTRAIT, (x, y) => {
    // иллюминатор с водой и пузырями
    const pd = Math.hypot(x - 37.5, y - 11.5);
    if (pd < 8.5) {
      if (pd > 7) return dither(ramp(C.brass!, 4, 0.5), 0.6 - (y - 4) / 20, x, y);
      if ((x === 35 && y === 9) || (x === 39 && y === 13) || (x === 36 && y === 15)) return C.glint!;
      return dither(water, 0.65 - (y - 4) / 18 + (x - y > 26 ? 0.2 : 0), x, y);
    }
    // приборы слева внизу
    for (const [gx, gy, col] of [[6, 40, C.select!], [6, 33, C.ember!]] as const) {
      const gd = Math.hypot(x - gx, y - gy);
      if (gd < 3.6) return gd > 2.6 ? metal[1]! : (Math.abs(x - gx - (y - gy)) < 0.8 && x >= gx ? col : C.ink!);
    }
    // панели стены кабины
    let v = 0.22 + (1 - y / PORTRAIT) * 0.22;
    if (x % 12 === 0 || y % 14 === 0) v -= 0.12;
    if (enemy && (x + y) % 9 === 0) v += 0.05;
    const t = dither(deep, v, x, y);
    return y > 44 ? mix(t, team, 0.3) : t;
  }, null);
}

function character(look: PilotLook, team: RGB, C: Colors, f: number): HTMLCanvasElement {
  const skin = ramp(hexToRgb(look.skin), 6, 0.55);
  const hair = ramp(hexToRgb(look.hair), 5, 0.5);
  const gear = ramp(hexToRgb(look.gear), 6, 0.6);
  const teamR = ramp(team, 5, 0.6);
  const brass = ramp(C.brass!, 5, 0.6);
  const glass = ramp(C.foam!, 5, 0.7);
  const dark = ramp(C.hullDark!, 5, 0.5);
  const eye = hexToRgb(look.eyes);
  const hx = 24, hy = 23;           // центр головы
  const rx = 10, ry = 12;

  const inHead = (x: number, y: number, grow = 0): [number, number, number] | null => {
    const jaw = 1 - Math.max(0, (y - hy - 3) / 12) * 0.38;
    const ex = (x + 0.5 - hx) / ((rx + grow) * jaw), ey = (y + 0.5 - hy) / (ry + grow);
    const e = ex * ex + ey * ey;
    if (e > 1) return null;
    return [ex, ey, Math.sqrt(1 - e)];
  };
  const blink = f === 1;
  const mouthOpen = f === 2 ? 2 : f === 3 ? 1 : 0;
  const masked = look.helmet === 'mask';

  return rasterSprite(PORTRAIT, (x, y) => {
    const px = x + 0.5, py = y + 0.5;

    // --- снаряжение поверх лица ---
    if (look.helmet === 'diver') {
      const d = Math.hypot(px - hx, py - hy + 1);
      if (d > 13 && d < 17.5 && py < 40) {
        if (Math.abs(d - 15.2) < 0.5 && Math.round(Math.atan2(py - hy, px - hx) * 5) % 2 === 0) return C.sandLight!; // заклёпки
        return dither(brass, 0.2 + lambert(px - hx, py - hy, 9) * 0.8 + specular(px - hx, py - hy, 9, 20) * 0.5, x, y);
      }
      if (d <= 13 && ((px - py > 6 && px - py < 8) || (px - py > 10 && px - py < 11))) return mix(C.white!, C.glint!, 0.4); // блик на стекле
    }
    if (look.helmet === 'mask' && py > 25 && py < 37) {
      const head = inHead(x, y, 0.5);
      if (head || Math.hypot(px - hx, py - 33) < 5) {
        if (Math.hypot(px - hx, py - 33) < 4) return Math.hypot(px - hx, py - 33) < 2.4 && (x + y) % 2 ? C.ink! : dither(dark, 0.6, x, y); // фильтр
        return dither(dark, 0.18 + (head ? lambert(head[0], head[1], head[2]) * 0.5 : 0.2), x, y);
      }
    }

    // --- шлемы и головные уборы ---
    const top = inHead(x, y, 1.6);
    if (look.helmet === 'cap' || look.helmet === 'officer' || look.helmet === 'hardhat') {
      const mat = look.helmet === 'hardhat' ? ramp(C.hazard!, 6, 0.6) : gear;
      const crownY = look.helmet === 'officer' ? 15 : 16;
      if (top && py < crownY) {
        if (look.helmet === 'officer' && py > crownY - 2.5) return dither(brass, 0.7, x, y); // золотая лента
        if (look.helmet === 'hardhat' && Math.abs(px - hx) < 1.5 && py > 9 && py < 13) return C.white!;   // фонарь
        if (look.helmet === 'cap' && Math.abs(px - hx) < 1.5 && py > 11 && py < 14) return teamR[4]!;      // кокарда
        return dither(mat, 0.25 + lambert(top[0], top[1], top[2]) * 0.75, x, y);
      }
      const brimW = look.helmet === 'hardhat' ? 14 : 12;
      if (py >= crownY && py < crownY + 2 && Math.abs(px - hx + (look.helmet === 'cap' ? -2 : 0)) < brimW) {
        return look.helmet === 'officer' ? dither(dark, 0.15, x, y) : dither(mat, 0.35, x, y);
      }
    }
    if (look.helmet === 'headset') {
      if (top && py < 15 && Math.abs(Math.hypot(px - hx, py - hy) - 11.8) < 1.1) return dither(gear, 0.6, x, y);
      for (const ex of [hx - 11, hx + 11]) if (Math.hypot(px - ex, py - 24) < 3.2) return dither(dark, Math.hypot(px - ex, py - 24) < 1.6 ? 0.7 : 0.3, x, y);
      // микрофон к губам
      if (py > 30 && py < 32 && px > hx - 10 && px < hx - 3) return dither(dark, 0.5, x, y);
      if (Math.hypot(px - (hx - 3), py - 31) < 1.3) return C.ink!;
    }

    // --- очки / повязка ---
    if (look.goggles && py > 21 && py < 27) {
      for (const ex of [hx - 4.5, hx + 4.5]) {
        const d = Math.hypot(px - ex, py - 24);
        if (d < 3.4) return d > 2.4 ? dither(dark, 0.3, x, y) : dither(glass, 0.5 + (px - ex < 0 && py < 24 ? 0.4 : 0), x, y);
      }
      if (inHead(x, y, 0.8) && Math.abs(py - 24) < 1) return dither(dark, 0.2, x, y);
    }
    if (look.eyepatch) {
      if (Math.hypot(px - (hx - 4.5), py - 24) < 2.6) return C.ink!;
      if (Math.abs(py - (24 - (px - hx) * 0.55)) < 0.6 && inHead(x, y, 0.5)) return C.ink!;
    }

    // --- лицо ---
    const head = inHead(x, y);
    // волосы спереди
    if (look.hairStyle === 'mohawk' && Math.abs(px - hx) < 2.6 && py > 4 && py < 15) return dither(hair, 0.4 + (px < hx ? 0.3 : 0) + (y % 2) * 0.1, x, y);
    const hairTop = look.helmet === 'none' || look.helmet === 'headset' || look.helmet === 'diver' || look.helmet === 'mask';
    if (hairTop && head && look.hairStyle !== 'bald' && look.hairStyle !== 'mohawk' && py < 17 - Math.abs(px - hx) * 0.12 + Math.sin(px * 1.3) * 0.8) {
      return dither(hair, 0.25 + lambert(head[0], head[1], head[2]) * 0.6 + ((x + (y >> 1)) % 3 === 0 ? 0.12 : 0), x, y);
    }
    if (head) {
      const lx = px - hx, ly = py - hy;
      // глаза
      for (const ex of [-4.5, 4.5]) {
        if (look.eyepatch && ex < 0) continue;
        if (Math.abs(lx - ex) < 2.5 && ly > -0.6 && ly < 2.4) {
          if (blink) return ly > 0.8 && ly < 1.8 ? dither(skin, 0.12, x, y) : dither(skin, 0.45, x, y);
          if (masked) return ly > 1.6 ? C.ink! : mix(eye, C.white!, 0.25);
          if (ly < 0.4) return dither(skin, 0.2, x, y);                       // веко
          const ix = lx - ex + (ex < 0 ? 0.3 : -0.3);                          // зрачки чуть к носу
          if (Math.abs(ix) < 1.1) return ix < 0 && ly < 1.4 ? C.white! : (Math.abs(ix) < 0.6 && ly > 1.1 ? C.ink! : eye);
          return C.white!;
        }
        // брови
        if (Math.abs(lx - ex) < 2.6 && Math.abs(ly + 1.9 + (enemyBrow(look) ? (ex < 0 ? 1 : -1) * (lx - ex) * 0.25 : 0)) < 0.6) return hair[1]!;
      }
      if (look.scar && Math.abs(lx + 5 - (ly - 3) * 0.6) < 0.5 && ly > -1 && ly < 8) return mix(skin[2]!, C.coral!, 0.6);
      // нос
      if (Math.abs(lx) < 1.4 && ly > 1 && ly < 5) return lx > 0.3 ? dither(skin, 0.3, x, y) : (ly > 4 ? dither(skin, 0.75, x, y) : null) ?? dither(skin, 0.55 + lambert(head[0], head[1], head[2]) * 0.3, x, y);
      // усы, рот, борода
      if (look.mustache && ly > 5.6 && ly < 7.2 && Math.abs(lx) < 4) return dither(hair, 0.35 + (lx < 0 ? 0.2 : 0), x, y);
      const mouthY = 7.8;
      if (!masked && Math.abs(lx) < 2.6 && ly > mouthY - 0.6 && ly < mouthY + mouthOpen + 0.4) {
        if (mouthOpen && ly > mouthY && ly < mouthY + mouthOpen) return Math.abs(lx) < 1.5 && ly < mouthY + 0.8 ? C.white! : [80, 20, 30];
        return mix(skin[1]!, C.coral!, 0.45);
      }
      if (look.beard && ly > 4.5 && (ly > 9 || Math.abs(lx) > 3)) return dither(hair, 0.2 + lambert(head[0], head[1], head[2]) * 0.5 + ((x + y) % 3 === 0 ? 0.15 : 0), x, y);
      // кожа со светом; щёки чуть румяные
      let col = dither(skin, 0.18 + lambert(head[0], head[1], head[2] * 1.2) * 0.82 + (look.hairStyle === 'bald' ? specular(head[0], head[1], head[2], 30) * 0.4 : 0), x, y);
      if (Math.abs(Math.abs(lx) - 6) < 1.5 && Math.abs(ly - 4) < 1.2) col = mix(col, C.coral!, 0.18);
      return col;
    }
    // уши
    for (const ex of [hx - 10.3, hx + 10.3]) if (Math.hypot((px - ex) * 1.5, py - 24.5) < 3) return dither(skin, ex < hx ? 0.55 : 0.3, x, y);
    // волосы сзади: длинные и хвост
    if ((look.hairStyle === 'long' || look.hairStyle === 'ponytail') && inHead(x, y, 2.5) && py > 12) {
      if (look.hairStyle === 'long' || px > hx + 6) return dither(hair, 0.3 + ((x * 2 + y) % 4 === 0 ? 0.15 : 0), x, y);
    }
    if (look.hairStyle === 'ponytail' && Math.hypot(px - (hx + 12), (py - 30) * 0.5) < 3.2) return dither(hair, 0.35 + (y % 3 === 0 ? 0.15 : 0), x, y);
    // шея
    if (Math.abs(px - hx) < 4.6 && py > 31 && py < 40) return dither(skin, 0.2 + (px < hx ? 0.15 : 0), x, y);
    // плечи и форма
    const sx = (px - hx) / 23, sy = (py - 52) / 15;
    const s = sx * sx + sy * sy;
    if (s <= 1 && py > 35) {
      if (Math.abs(px - hx) < 6 && py < 40) return dither(gear, 0.15, x, y);                    // воротник-тень
      if (px > hx + 9 && px < hx + 15 && py > 40 && py < 45) return dither(teamR, 0.75, x, y); // нашивка
      if (Math.abs(px - hx) < 1 && py > 40) return dither(dark, 0.5, x, y);                       // молния
      return dither(gear, 0.2 + lambert(sx, sy, Math.sqrt(1 - s)) * 0.75, x, y);
    }
    return null;
  }, C.ink!);
}

const enemyBrow = (look: PilotLook) => look.scar || look.helmet === 'mask';
