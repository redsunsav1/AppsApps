import { BIOME_INDEX, type MapGrid } from '../sim/map/grid';
import { hash3, makeCanvas, pack, type RGB } from './pixel';
import type { Colors } from './sprites';

const B = BIOME_INDEX;

/**
 * Карта целиком рисуется один раз в offscreen-canvas: тайлы 16×16 с текстурой,
 * дизеринг на стыках биомов, скалы с бликом сверху и тенью снизу.
 */
export function renderMap(grid: MapGrid, C: Colors, T: number): HTMLCanvasElement {
  const W = grid.width * T, H = grid.h * T;
  const [canvas, ctx] = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const px = new Uint32Array(img.data.buffer);
  const biomeAt = (tx: number, ty: number) => (grid.inBounds(tx, ty) ? grid.biome[grid.idx(tx, ty)]! : B.rock);
  const rockAt = (tx: number, ty: number) => !grid.inBounds(tx, ty) || grid.blocked[grid.idx(tx, ty)] === 1;

  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.width; tx++) {
      const b = biomeAt(tx, ty);
      const rock = rockAt(tx, ty);
      // коралловые «кусты» — два пятна на тайл
      const blobs = b === B.coral ? [0, 1].map((k) => [3 + hash3(tx, ty, k) * 10, 3 + hash3(ty, tx, k + 7) * 10, 2 + hash3(tx, ty, k + 3) * 2]) : [];
      const crack = b === B.volcanic && hash3(tx, ty, 99) < 0.12;
      for (let y = 0; y < T; y++) {
        for (let x = 0; x < T; x++) {
          const h = hash3(tx * T + x, ty * T + y);
          let c: RGB;
          if (rock) {
            c = C.rock!;
            if (h < 0.12) c = C.rockDark!; else if (h > 0.9) c = C.rockLight!;
            if (!rockAt(tx, ty - 1) && y < 3) c = y === 0 ? C.white! : C.rockLight!;
            else if (!rockAt(tx - 1, ty) && x < 2) c = C.rockLight!;
            if (!rockAt(tx, ty + 1) && y >= T - 5) c = (x % 3 === 0) ? C.ink! : C.rockDark!; // обрыв
            else if (!rockAt(tx + 1, ty) && x >= T - 2) c = C.rockDark!;
          } else {
            const nb = edgeNeighbour(x, y, T);
            let bb = b;
            // дизеринг на стыке: шахматка у самой границы, реже — дальше
            if (nb) {
              const ob = biomeAt(tx + nb[0], ty + nb[1]);
              if (ob !== b && ob !== B.rock && !rockAt(tx + nb[0], ty + nb[1])) {
                if ((nb[2] === 0 && (x + y) % 2 === 0) || (nb[2] === 1 && (x * 3 + y) % 4 === 0)) bb = ob;
              }
            }
            c = texel(bb, tx * T + x, ty * T + y, h, C);
            if (bb === B.coral) {
              for (const [bx, by, br] of blobs) {
                const d = Math.hypot(x - bx!, y - by!);
                if (d <= br!) c = d < br! - 1 && x < bx! && y < by! ? C.coralLight! : C.coral!;
              }
            }
            if (crack && Math.abs((x - y + Math.floor(hash3(tx, ty, 5) * 8)) % 9) === 0 && y > 2 && y < 13) c = (x + y) % 3 ? C.lava! : C.ember!;
            // тень от скалы сверху — дизеринг 50%
            if (rockAt(tx, ty - 1) && y < 4 && (x + y) % 2 === 0) c = darker(c, C);
            if (rockAt(tx - 1, ty) && x < 2 && (x + y) % 2 === 1) c = darker(c, C);
          }
          px[(ty * T + y) * W + tx * T + x] = pack(c);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function texel(b: number, wx: number, wy: number, h: number, C: Colors): RGB {
  switch (b) {
    case B.sand:
      // рябь песка — классические волнистые полоски
      if ((wy + Math.floor(Math.sin(wx / 5) * 2)) % 7 === 0) return C.sandLight!;
      return h < 0.13 ? C.sandDark! : h > 0.95 ? C.sandLight! : C.sand!;
    case B.abyss:
      return (wx + wy) % 4 === 0 && h > 0.4 ? C.ink! : h > 0.97 ? C.water! : C.deep!;
    case B.volcanic:
      return h < 0.2 ? C.rockDark! : h > 0.995 ? C.ember! : C.ash!;
    default: // ил, коралловое дно
      return h < 0.1 ? C.deep! : h > 0.94 ? C.shallow! : C.water!;
  }
}

function darker(c: RGB, C: Colors): RGB {
  if (c === C.sand || c === C.sandLight) return C.sandDark!;
  if (c === C.water || c === C.shallow) return C.deep!;
  return C.ink!;
}

/** Ближайший край тайла в пределах 2 px: [dx, dy, расстояние]. */
function edgeNeighbour(x: number, y: number, T: number): [number, number, number] | null {
  const d = [x, T - 1 - x, y, T - 1 - y];
  const m = Math.min(...d);
  if (m > 1) return null;
  const i = d.indexOf(m);
  return [[-1, 0], [1, 0], [0, -1], [0, 1]][i]!.concat(m) as [number, number, number];
}
