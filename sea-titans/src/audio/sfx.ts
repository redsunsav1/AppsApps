/**
 * 8-bit звук на WebAudio: прямоугольные волны и шум, как в чипе NES.
 * Включается после первого клика (политика браузеров), M — выключить.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  muted = false;

  unlock(): void {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      // глухой подводный фильтр на всё
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      this.master.connect(lp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  private ok(name: string, gapMs: number): boolean {
    if (!this.ctx || !this.master || this.muted) return false;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < gapMs) return false;
    this.last.set(name, now);
    return true;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const c = this.ctx!, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number): void {
    const c = this.ctx!, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur);
  }

  shot(kind: number): void {
    if (!this.ok(`shot${kind}`, 60)) return;
    if (kind === 0) this.tone('square', 900, 500, 0.05, 0.25);
    else if (kind === 1) this.tone('square', 420, 120, 0.22, 0.3);
    else { this.tone('square', 160, 60, 0.18, 0.35); this.burst(0.12, 0.3, 1200); }
  }

  hit(big: boolean): void {
    if (!this.ok(big ? 'hitBig' : 'hit', 50)) return;
    this.burst(big ? 0.35 : 0.1, big ? 0.6 : 0.25, big ? 1800 : 2500);
  }

  boom(building: boolean): void {
    if (!this.ok('boom', 70)) return;
    this.burst(building ? 1.2 : 0.5, 0.9, building ? 1400 : 2200);
    this.tone('triangle', building ? 120 : 180, 30, building ? 0.9 : 0.4, 0.5);
  }

  select(): void { if (this.ok('select', 60)) this.tone('square', 1200, 1200, 0.04, 0.15); }
  ack(): void { if (this.ok('ack', 60)) { this.tone('square', 660, 660, 0.05, 0.15); this.tone('square', 990, 990, 0.06, 0.15, 0.06); } }
  built(): void { if (this.ok('built', 150)) { this.tone('square', 523, 523, 0.08, 0.2); this.tone('square', 784, 784, 0.12, 0.2, 0.09); } }
  coin(): void { if (this.ok('coin', 120)) { this.tone('square', 988, 988, 0.05, 0.1); this.tone('square', 1319, 1319, 0.12, 0.1, 0.05); } }
  denied(): void { if (this.ok('denied', 150)) this.tone('square', 180, 140, 0.15, 0.25); }
  alert(): void { if (this.ok('alert', 2000)) for (let i = 0; i < 3; i++) this.tone('square', 880, 660, 0.12, 0.25, i * 0.18); }

  jingle(win: boolean): void {
    if (!this.ctx || this.muted) return;
    const notes = win ? [523, 659, 784, 1047] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone('square', f, f, 0.22, 0.25, i * 0.2));
  }
}
