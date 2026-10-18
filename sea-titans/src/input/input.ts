import type { Hotkeys } from '../data/schema';
import type { GameController } from '../game';
import type { Camera } from '../render/camera';
import { Position } from '../sim/components';
import type { Iso } from '../render/iso';

export interface InputHooks {
  togglePause(): void;
  speed(delta: number): void;
  toggleDebug(): void;
  toggleDebugPaths(): void;
  stress(): void;
}

const DRAG_THRESHOLD = 5;
const DOUBLE_CLICK_MS = 320;

/** Мышь и клавиатура → команды контроллера. Раскладка — data/hotkeys.json. */
export class Input {
  private keys = new Set<string>();
  private mouseX = -1;
  private mouseY = -1;
  private inside = false;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private panning: { x: number; y: number } | null = null;
  private lastClick = 0;
  private lastGroupTap = { n: -1, t: 0 };
  /** Прямоугольник выделения для отрисовки (экран). */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(
    el: HTMLElement,
    private readonly game: GameController,
    private readonly camera: Camera,
    private readonly iso: Iso,
    private readonly hk: Hotkeys,
    private readonly cam: { scrollSpeed: number; edgeScrollSpeed: number; edgeScrollMargin: number; zoomStep: number },
    private readonly hooks: InputHooks,
  ) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.camera.zoomAt(e.deltaY < 0 ? this.cam.zoomStep : 1 / this.cam.zoomStep, e.clientX, e.clientY); }, { passive: false });
    document.addEventListener('pointerleave', () => { this.inside = false; });
    document.addEventListener('pointerenter', () => { this.inside = true; });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private down(e: PointerEvent): void {
    this.inside = true;
    if (e.button === 1) { this.panning = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (e.button === 2) {
      if (this.game.pendingMode) { this.game.pendingMode = null; return; }
      this.game.order(e.clientX, e.clientY, 'move', e.shiftKey);
      return;
    }
    if (e.button === 0) {
      if (this.game.pendingMode) {
        this.game.order(e.clientX, e.clientY, this.game.pendingMode, e.shiftKey);
        if (!e.shiftKey) this.game.pendingMode = null;
        return;
      }
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragging = false;
    }
  }

  private move(e: PointerEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.inside = true;
    if (this.panning) {
      this.camera.pan(this.panning.x - e.clientX, this.panning.y - e.clientY);
      this.panning = { x: e.clientX, y: e.clientY };
    }
    if (this.dragStart) {
      if (!this.dragging && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > DRAG_THRESHOLD) this.dragging = true;
      if (this.dragging) this.box = { x0: this.dragStart.x, y0: this.dragStart.y, x1: e.clientX, y1: e.clientY };
    }
  }

  private up(e: PointerEvent): void {
    if (e.button === 1) { this.panning = null; return; }
    if (e.button !== 0 || !this.dragStart) return;
    if (this.dragging && this.box) {
      this.game.boxSelect(this.box.x0, this.box.y0, this.box.x1, this.box.y1, e.shiftKey);
    } else {
      const now = performance.now();
      this.game.clickSelect(e.clientX, e.clientY, e.shiftKey, now - this.lastClick < DOUBLE_CLICK_MS);
      this.lastClick = now;
    }
    this.dragStart = null;
    this.dragging = false;
    this.box = null;
  }

  private keydown(e: KeyboardEvent): void {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const code = e.code;
    const g = this.hk.game, c = this.hk.commands;
    // Ctrl+1..9 — назначить группу, 1..9 — выбрать (дважды — камера к группе)
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit) {
      e.preventDefault();
      const n = Number(digit[1]);
      if (e.ctrlKey || e.metaKey) { this.game.assignGroup(n); return; }
      const units = this.game.recallGroup(n, e.shiftKey);
      const now = performance.now();
      if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < DOUBLE_CLICK_MS && units.length) this.focus(units);
      this.lastGroupTap = { n, t: now };
      return;
    }
    if (code === g.debug || code === g.debugPaths || code === 'F6') e.preventDefault();
    if (code === g.pause || code === g.pauseAlt) { e.preventDefault(); this.hooks.togglePause(); return; }
    if (code === g.speedUp || code === 'NumpadAdd') { this.hooks.speed(1); return; }
    if (code === g.speedDown || code === 'NumpadSubtract') { this.hooks.speed(-1); return; }
    if (code === g.debug) { this.hooks.toggleDebug(); return; }
    if (code === g.debugPaths) { this.hooks.toggleDebugPaths(); return; }
    if (code === 'F6') { this.hooks.stress(); return; }
    if (code === 'Escape') { this.game.pendingMode = null; this.game.selection.clear(); return; }
    if (code === c.stop) { this.game.stop(); return; }
    if (code === c.hold) { this.game.hold(); return; }
    if (code === c.attackMove) { if (this.game.selection.size) this.game.pendingMode = 'amove'; return; }
    if (code === c.patrol) { if (this.game.selection.size) this.game.pendingMode = 'patrol'; return; }
    this.keys.add(code);
  }

  private focus(units: number[]): void {
    let x = 0, y = 0;
    for (const e of units) { x += Position.x[e]! / 1024; y += Position.y[e]! / 1024; }
    x /= units.length; y /= units.length;
    this.camera.centerOn(this.iso.x(x, y), this.iso.y(x, y));
  }

  /** Камера: клавиши и края экрана. dt в секундах. */
  update(dt: number): void {
    const has = (list: string[]) => list.some((k) => this.keys.has(k));
    let dx = 0, dy = 0;
    const cam = this.hk.camera;
    if (has(cam.left)) dx -= 1;
    if (has(cam.right)) dx += 1;
    if (has(cam.up)) dy -= 1;
    if (has(cam.down)) dy += 1;
    let speed = this.cam.scrollSpeed;
    if (dx === 0 && dy === 0 && this.inside && this.mouseX >= 0 && !this.dragStart && !this.panning) {
      const m = this.cam.edgeScrollMargin;
      if (this.mouseX <= m) dx = -1;
      else if (this.mouseX >= window.innerWidth - m) dx = 1;
      if (this.mouseY <= m) dy = -1;
      else if (this.mouseY >= window.innerHeight - m) dy = 1;
      speed = this.cam.edgeScrollSpeed;
    }
    if (dx || dy) this.camera.pan(dx * speed * dt, dy * speed * dt);
  }

  get cursorMode(): string {
    return this.game.pendingMode ?? '';
  }
}
