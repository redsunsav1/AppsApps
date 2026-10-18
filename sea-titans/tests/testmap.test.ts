import { describe, expect, it } from 'vitest';
import { generateTestMap } from '../src/sim/map/testmap';

describe('тестовая карта', () => {
  for (const seed of [1, 2, 1337, 99999]) {
    it(`сид ${seed}: все проходимые клетки связны, споны свободны`, () => {
      const { grid, spawns } = generateTestMap(128, 128, seed);
      const reach = grid.floodFill(spawns[0]!.x, spawns[0]!.y);
      let passable = 0;
      for (let i = 0; i < grid.blocked.length; i++) {
        if (!grid.blocked[i]) { passable++; expect(reach[i]).toBe(1); }
      }
      expect(passable).toBeGreaterThan(grid.blocked.length * 0.6);
      for (const s of spawns) expect(grid.isBlocked(s.x, s.y)).toBe(false);
      // крупные юниты (класс 1) тоже должны доезжать между базами
      const reach1 = grid.floodFill(spawns[0]!.x, spawns[0]!.y, 1);
      expect(reach1[grid.idx(spawns[1]!.x, spawns[1]!.y)]).toBe(1);
    });
  }

  it('детерминирована по сиду', () => {
    const a = generateTestMap(64, 64, 5).grid, b = generateTestMap(64, 64, 5).grid;
    expect(Buffer.from(a.blocked).equals(Buffer.from(b.blocked))).toBe(true);
    expect(Buffer.from(a.biome).equals(Buffer.from(b.biome))).toBe(true);
  });
});
