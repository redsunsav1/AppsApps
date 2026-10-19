// xoshiro128** — быстрый детерминированный генератор, состояние сериализуемо.
export class Rng {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    let x = seed >>> 0 || 0x9e3779b9;
    for (let i = 0; i < 4; i++) {
      // splitmix32 для инициализации
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }

  /** Следующее u32. */
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1]!, 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1]! << 9) >>> 0;
    s[2] = (s[2]! ^ s[0]!) >>> 0;
    s[3] = (s[3]! ^ s[1]!) >>> 0;
    s[1] = (s[1]! ^ s[2]!) >>> 0;
    s[0] = (s[0]! ^ s[3]!) >>> 0;
    s[2] = (s[2]! ^ t) >>> 0;
    s[3] = rotl(s[3]!, 11);
    return result;
  }

  /** Целое в [0, n). */
  int(n: number): number {
    return Math.floor((this.nextU32() / 4294967296) * n);
  }

  /** Float в [0, 1). Только для генерации карт и визуала, не для боевой логики. */
  float(): number {
    return this.nextU32() / 4294967296;
  }

  getState(): number[] {
    return Array.from(this.s);
  }

  setState(state: number[]): void {
    this.s.set(state);
  }
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
