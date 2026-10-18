import { describe, expect, it } from 'vitest';
import { ANGLE_FULL, angleDiff, fatan2, fcos, fsin, ONE } from '../src/core/fixed';
import { Rng } from '../src/core/rng';

describe('fixed-point', () => {
  it('fatan2 близок к Math.atan2 (< 0.5°)', () => {
    for (let a = 0; a < 360; a += 1.7) {
      const r = (a * Math.PI) / 180;
      const got = fatan2(Math.round(Math.sin(r) * 5000), Math.round(Math.cos(r) * 5000));
      const want = Math.round((a / 360) * ANGLE_FULL) & 0xffff;
      expect(Math.abs(angleDiff(got, want))).toBeLessThan((0.5 / 360) * ANGLE_FULL);
    }
  });

  it('fcos/fsin согласованы', () => {
    expect(fcos(0)).toBe(ONE);
    expect(fsin(16384)).toBe(ONE);
    expect(Math.abs(fcos(32768) + ONE)).toBeLessThanOrEqual(1);
  });

  it('angleDiff выбирает кратчайший поворот', () => {
    expect(angleDiff(65000, 500)).toBe(1036);
    expect(angleDiff(500, 65000)).toBe(-1036);
  });
});

describe('rng', () => {
  it('одинаковый сид — одинаковая последовательность, состояние восстанавливается', () => {
    const a = new Rng(42), b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.nextU32());
    const seqB = Array.from({ length: 100 }, () => b.nextU32());
    expect(seqA).toEqual(seqB);
    const st = a.getState();
    const next = a.nextU32();
    b.setState(st);
    expect(b.nextU32()).toBe(next);
  });

  it('int(n) в диапазоне', () => {
    const r = new Rng(7);
    for (let i = 0; i < 1000; i++) { const v = r.int(10); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(10); }
  });
});
