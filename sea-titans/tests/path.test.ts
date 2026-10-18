import { describe, expect, it } from 'vitest';
import { DX8, DY8 } from '../src/sim/map/grid';
import { AStar } from '../src/sim/path/astar';
import { FlowField, NO_DIR } from '../src/sim/path/flowfield';
import { lineClear } from '../src/sim/path/los';
import { asciiGrid } from './helpers';

const MAZE = [
  '..........',
  '.########.',
  '.#......#.',
  '.#.##.#.#.',
  '.#.#..#.#.',
  '.#.#..#...',
  '.#.####.##',
  '.#........',
  '.########.',
  '..........',
];

describe('A*', () => {
  it('находит путь в обход стен, без срезания углов', () => {
    const g = asciiGrid(MAZE);
    const path = new AStar(g, 10000).find(g.idx(0, 0), g.idx(4, 4));
    expect(path).not.toBeNull();
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!, b = path![i]!;
      const ax = a % g.width, ay = (a / g.width) | 0, bx = b % g.width, by = (b / g.width) | 0;
      expect(Math.max(Math.abs(ax - bx), Math.abs(ay - by))).toBe(1);
      expect(g.isBlocked(bx, by)).toBe(false);
      if (ax !== bx && ay !== by) { expect(g.isBlocked(bx, ay)).toBe(false); expect(g.isBlocked(ax, by)).toBe(false); }
    }
  });

  it('null, если цель недостижима', () => {
    const g = asciiGrid(['..#..', '..#..', '..#..']);
    expect(new AStar(g, 1000).find(g.idx(0, 0), g.idx(4, 0))).toBeNull();
  });

  it('путь оптимален на открытой карте (октильная метрика)', () => {
    const g = asciiGrid(Array.from({ length: 20 }, () => '.'.repeat(20)));
    const path = new AStar(g, 10000).find(g.idx(0, 0), g.idx(10, 5));
    expect(path!.length).toBe(11); // max(dx, dy) + 1
  });
});

describe('flow field', () => {
  it('из любой достижимой клетки ведёт к цели', () => {
    const g = asciiGrid(MAZE);
    const goal = g.idx(4, 4);
    const f = new FlowField(goal, g);
    for (let c = 0; c < g.width * g.h; c++) {
      if (!f.reachable(c) || c === goal) continue;
      let x = c % g.width, y = (c / g.width) | 0, steps = 0;
      while (g.idx(x, y) !== goal && steps < 200) {
        const d = f.dir[g.idx(x, y)]!;
        expect(d).not.toBe(NO_DIR);
        x += DX8[d]!; y += DY8[d]!; steps++;
      }
      expect(g.idx(x, y)).toBe(goal);
    }
  });
});

describe('line of sight', () => {
  it('блокируется скалой', () => {
    const g = asciiGrid(['.....', '..#..', '.....']);
    expect(lineClear(g, 512, 1536, 4608, 1536)).toBe(false);
    expect(lineClear(g, 512, 512, 4608, 512)).toBe(true);
  });
});

describe('классы размера', () => {
  it('крупный юнит (класс 1) не проходит щель в одну клетку, мелкий проходит', () => {
    const g = asciiGrid([
      '..........',
      '..........',
      '#####.####',
      '..........',
      '..........',
    ]);
    const astar = new AStar(g, 10000);
    expect(astar.find(g.idx(0, 0), g.idx(0, 3), 0)).not.toBeNull();
    expect(astar.find(g.idx(0, 0), g.idx(0, 3), 1)).toBeNull();
  });

  it('класс 1 проходит коридор шириной 2', () => {
    const g = asciiGrid([
      '..........',
      '..........',
      '####..####',
      '..........',
      '..........',
    ]);
    expect(new AStar(g, 10000).find(g.idx(0, 0), g.idx(0, 3), 1)).not.toBeNull();
  });
});
