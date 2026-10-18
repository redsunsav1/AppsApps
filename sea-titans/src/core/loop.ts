/**
 * Фиксированный тик симуляции + рендер с интерполяцией.
 * update() вызывается ровно tickRate·speed раз в секунду игрового времени,
 * render(alpha) — каждый кадр, alpha ∈ [0,1) между прошлым и текущим тиком.
 */
export class GameLoop {
  speed = 1;
  paused = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private readonly tickMs: number;
  private static readonly MAX_TICKS_PER_FRAME = 8;

  constructor(
    tickRate: number,
    private readonly update: () => void,
    private readonly render: (alpha: number, dtMs: number) => void,
  ) {
    this.tickMs = 1000 / tickRate;
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(now - this.last, 250);
      this.last = now;
      if (!this.paused) {
        this.acc += dt * this.speed;
        let n = 0;
        while (this.acc >= this.tickMs && n < GameLoop.MAX_TICKS_PER_FRAME) {
          this.update();
          this.acc -= this.tickMs;
          n++;
        }
        if (n === GameLoop.MAX_TICKS_PER_FRAME) this.acc = 0; // не догоняем бесконечно
      }
      this.render(this.paused ? 1 : this.acc / this.tickMs, dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
