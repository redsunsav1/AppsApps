import { makeCanvas } from '../render/pixel';

/** Пиксельные значки ролей 9×9: строки, где символ — цвет. */
const ICONS: Record<string, { rows: string[]; pal: Record<string, string> }> = {
  base: { rows: ['....y....', '...yyy...', '.b.bbb.b.', '.bbbbbbb.', '.bbcccbb.', '.bbcccbb.', '.bbbbbbb.', '.bbbbbbb.', 'ddddddddd'], pal: { y: '#ffd23f', b: '#8c96a8', c: '#5fc3d6', d: '#4a5268' } },
  econ: { rows: ['....w....', '...wcc...', '..wccmm..', '..wccmm..', '.wccmmmm.', '..ccmmm..', '...cmm...', '....m....', '.ddddddd.'], pal: { w: '#ffffff', c: '#c0f0ff', m: '#6a9ad8', d: '#5d5d78' } },
  recon: { rows: ['.........', '..wwwww..', '.w.....w.', 'w..ccc..w', 'w.ckkkc.w', 'w..ccc..w', '.w.....w.', '..wwwww..', '.........'], pal: { w: '#a6f0e8', c: '#3fa8ff', k: '#0b0f2a' } },
  fleet: { rows: ['.........', '.........', '.r.......', 'rrgggggw.', 'rggggggww', 'rrgggggw.', '.r.......', '..b.b.b..', '.b.b.b.b.'], pal: { r: '#c8a040', g: '#8c96a8', w: '#f4f4e8', b: '#5fc3d6' } },
  siege: { rows: ['....y....', '.y.yoy.y.', '..yoooy..', '.yoowooy.', 'yoowwwooy', '.yoowooy.', '..yoooy..', '.y.yoy.y.', '....y....'], pal: { y: '#ffb02e', o: '#e84a1a', w: '#ffffff' } },
};

export function roleIcon(key: string, scale = 2): HTMLCanvasElement {
  const ic = ICONS[key] ?? ICONS.base!;
  const [c, ctx] = makeCanvas(9 * scale, 9 * scale);
  ic.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = ic.pal[ch];
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }));
  return c;
}

export const KIND_NAMES: Record<string, string> = { unit: 'боевые лодки', harvester: 'сборщики', building: 'базы' };
