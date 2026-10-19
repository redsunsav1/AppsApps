import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistry } from '../src/data/registry';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });

describe('архитектура', () => {
  it('sim/core/data не зависят от рендера, UI, ввода и Pixi', () => {
    const bad = (spec: string) => spec === 'pixi.js' || (/\/(render|ui|input|audio)\//.test(spec) && !spec.endsWith('.json'));
    for (const dir of ['src/sim', 'src/core', 'src/data']) {
      for (const f of files(dir)) {
        const specs = [...readFileSync(f, 'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map((m) => m[1]!);
        expect(specs.filter(bad), f).toEqual([]);
      }
    }
  });

  it('конфиги валидны', () => {
    const reg = loadRegistry();
    expect(reg.units.length).toBeGreaterThan(0);
  });
});
