/** Бинарная min-куча по (key, tie, value) на typed arrays — детерминированный порядок, без аллокаций. */
export class MinHeap {
  private keys = new Int32Array(1024);
  private tie = new Int32Array(1024);
  private vals = new Int32Array(1024);
  size = 0;
  /** Ключ последнего извлечённого элемента (для ленивого удаления в Дейкстре). */
  lastKey = 0;

  clear(): void {
    this.size = 0;
  }

  push(key: number, tie: number, value: number): void {
    if (this.size === this.vals.length) this.grow();
    let i = this.size++;
    const K = this.keys, T = this.tie, V = this.vals;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!lt(key, tie, value, K[p]!, T[p]!, V[p]!)) break;
      K[i] = K[p]!; T[i] = T[p]!; V[i] = V[p]!;
      i = p;
    }
    K[i] = key; T[i] = tie; V[i] = value;
  }

  pop(): number {
    const K = this.keys, T = this.tie, V = this.vals;
    const top = V[0]!;
    this.lastKey = K[0]!;
    const n = --this.size;
    if (n === 0) return top;
    const key = K[n]!, tie = T[n]!, val = V[n]!;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      if (l >= n) break;
      const r = l + 1;
      const m = r < n && lt(K[r]!, T[r]!, V[r]!, K[l]!, T[l]!, V[l]!) ? r : l;
      if (!lt(K[m]!, T[m]!, V[m]!, key, tie, val)) break;
      K[i] = K[m]!; T[i] = T[m]!; V[i] = V[m]!;
      i = m;
    }
    K[i] = key; T[i] = tie; V[i] = val;
    return top;
  }

  private grow(): void {
    const n = this.vals.length * 2;
    const k = new Int32Array(n); k.set(this.keys); this.keys = k;
    const t = new Int32Array(n); t.set(this.tie); this.tie = t;
    const v = new Int32Array(n); v.set(this.vals); this.vals = v;
  }
}

const lt = (k1: number, t1: number, v1: number, k2: number, t2: number, v2: number): boolean =>
  k1 !== k2 ? k1 < k2 : t1 !== t2 ? t1 < t2 : v1 < v2;
