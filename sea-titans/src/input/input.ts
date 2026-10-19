import type { Hotkeys } from '../data/schema';
import type { GameController } from '../game';
import type { Renderer } from '../render/renderer';
import { FX_TO_PX } from '../render/renderer';
import { Position } from '../sim/components';

export interface InputHooks {
  togglePause(): void;
  speed(delta: number): void;
  toggleDebug(): void;
  toggleMute(): void;
  toggleHelp(): void;
  build(slot: number): void;
  anyInput(): void;
}

const DRAG_THRESHOLD = 4;
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

  constructor(
    el: HTMLElement,
    private readonly game: GameController,
    private readonly view: Renderer,
    private readonly hk: Hotkeys,
    private readonly cam: { scrollSpeed: number; edgeScrollMargin: number },
    private readonly hooks: InputHooks,
  ) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    document.addEventListener('pointerleave', () => { this.inside = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.inside = false; });
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  private down(e: PointerEvent): void {
    this.inside = true;
    this.hooks.anyInput();
    if (e.button === 1) { this.panning = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (e.button === 2) {
      if (this.game.pendingMode) { this.game.pendingMode = null; return; }
      this.game.rightClick(e.clientX, e.clientY, e.shiftKey);
      return;
    }
    if (e.button !== 0) return;
    if (this.game.pendingMode) {
      this.game.order(e.clientX, e.clientY, this.game.pendingMode, e.shiftKey);
      if (!e.shiftKey) this.game.pendingMode = null;
      return;
    }
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.dragging = false;
  }

  private move(e: PointerEvent): void {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;
    this.inside = true;
    if (this.panning) {
      this.view.pan((this.panning.x - e.clientX) / this.view.scale, (this.panning.y - e.clientY) / this.view.scale);
      this.panning = { x: e.clientX, y: e.clientY };
    }
    if (this.dragStart) {
      if (!this.dragging && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > DRAG_THRESHOLD * this.view.scale) this.dragging = true;
      if (this.dragging) {
        const [x0, y0] = this.view.toBuffer(this.dragStart.x, this.dragStart.y);
        const [x1, y1] = this.view.toBuffer(e.clientX, e.clientY);
        this.view.box = { x0, y0, x1, y1 };
      }
    }
  }

  private up(e: PointerEvent): void {
    if (e.button === 1) { this.panning = null; return; }
    if (e.button !== 0 || !this.dragStart) return;
    if (this.dragging) this.game.boxSelect(this.dragStart.x, this.dragStart.y, e.clientX, e.clientY, e.shiftKey);
    else {
      const now = performance.now();
      this.game.clickSelect(e.clientX, e.clientY, e.shiftKey, now - this.lastClick < DOUBLE_CLICK_MS);
      this.lastClick = now;
    }
    this.dragStart = null;
    this.dragging = false;
    this.view.box = null;
  }

  private keydown(e: KeyboardEvent): void {
    this.hooks.anyInput();
    const code = e.code;
    const g = this.hk.game, c = this.hk.commands;
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
    const slot = this.hk.build.indexOf(code);
    if (slot >= 0 && !e.ctrlKey && !e.metaKey) { this.hooks.build(slot); return; }
    if ([g.debug, g.help, 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
    if (code === g.pause || code === g.pauseAlt) { this.hooks.togglePause(); return; }
    if (code === g.speedUp || code === 'NumpadAdd') { this.hooks.speed(1); return; }
    if (code === g.speedDown || code === 'NumpadSubtract') { this.hooks.speed(-1); return; }
    if (code === g.debug) { this.hooks.toggleDebug(); return; }
    if (code === g.mute) { this.hooks.toggleMute(); return; }
    if (code === g.help) { this.hooks.toggleHelp(); return; }
    if (code === g.home) { const b = this.game.base(); if (b >= 0) this.focus([b]); return; }
    if (code === 'Escape') { this.game.pendingMode = null; this.game.selection.clear(); return; }
    if (code === c.stop) { this.game.stop(); return; }
    if (code === c.hold) { this.game.hold(); return; }
    if (code === c.attackMove) { if (this.game.selection.size) this.game.pendingMode = 'amove'; return; }
    if (code === c.patrol) { if (this.game.selection.size) this.game.pendingMode = 'patrol'; return; }
    this.keys.add(code);
  }

  focus(units: number[]): void {
    let x = 0, y = 0;
    for (const e of units) { x += Position.x[e]! / FX_TO_PX; y += Position.y[e]! / FX_TO_PX; }
    this.view.centerOn(x / units.length, y / units.length);
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
    if (dx === 0 && dy === 0 && this.inside && this.mouseX >= 0 && !this.dragStart && !this.panning) {
      const m = this.cam.edgeScrollMargin;
      if (this.mouseX <= m) dx = -1; else if (this.mouseX >= window.innerWidth - m) dx = 1;
      if (this.mouseY <= m) dy = -1; else if (this.mouseY >= window.innerHeight - m) dy = 1;
    }
    if (dx || dy) this.view.pan((dx * this.cam.scrollSpeed * dt), (dy * this.cam.scrollSpeed * dt));
  }
}
