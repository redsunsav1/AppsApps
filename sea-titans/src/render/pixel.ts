/** Пиксельные примитивы: всё рисуется целыми пикселями, без сглаживания. */

export type RGB = [number, number, number];

export const hexToRgb = (hex: string): RGB => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Упакованный цвет для Uint32Array поверх ImageData (little-endian: ABGR). */
export const pack = ([r, g, b]: RGB, a = 255): number => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Детерминированный хэш для «случайной» текстуры. */
export function hash3(x: number, y: number, z = 0): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Залитый пиксельный круг (построчно, без антиалиасинга). */
export function fillCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
  }
}

/** Пиксельное кольцо толщиной t. */
export function strokeCircle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t = 1): void {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  const ri = Math.max(0, r - t);
  for (let dy = -r; dy <= r; dy++) {
    const wo = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
    const inner = ri * ri - dy * dy;
    if (inner < 0) { ctx.fillRect(cx - wo, cy + dy, wo * 2 + 1, 1); continue; }
    const wi = Math.floor(Math.sqrt(inner + ri * 0.8));
    ctx.fillRect(cx - wo, cy + dy, wo - wi, 1);
    ctx.fillRect(cx + wi + 1, cy + dy, wo - wi, 1);
  }
}

/**
 * Растровый спрайт: функция возвращает цвет пикселя или null. После — тёмная обводка
 * по контуру (классический приём 8-bit, чтобы силуэт читался на любом фоне).
 */
export function rasterSprite(size: number, fn: (x: number, y: number) => RGB | null, outline: RGB | null): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const px = new Uint32Array(img.data.buffer);
  const filled = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const col = fn(x, y);
    if (col) { px[y * size + x] = pack(col); filled[y * size + x] = 1; }
  }
  if (outline) {
    const o = pack(outline);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (filled[y * size + x]) continue;
      const n = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < size && yy < size && filled[yy * size + xx] === 1;
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) px[y * size + x] = o;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
