import type { Registry } from '../data/registry';
import type { GameController } from '../game';
import { Unit } from '../sim/components';

const MODE_NAMES: Record<string, string> = { amove: 'АТАКА-ДВИЖЕНИЕ: укажите точку', patrol: 'ПАТРУЛЬ: укажите точку' };

/** Простой DOM-HUD этапа 1. Металлический скин фракций и Preact — этапы 7 и 10. */
export class Hud {
  private readonly stats: HTMLElement;
  private readonly sel: HTMLElement;
  private readonly mode: HTMLElement;
  private readonly debug: HTMLElement;
  private last = 0;
  debugVisible = false;

  constructor(root: HTMLElement, private readonly reg: Registry, private readonly game: GameController, minimap: HTMLCanvasElement) {
    const k = reg.hotkeys.commands;
    const key = (code: string) => code.replace(/^Key/, '');
    root.innerHTML = `
      <div class="topbar panel">
        <span class="title">МОРСКИЕ ТИТАНЫ: РАЗЛОМ</span>
        <span class="res">Металл —</span><span class="res">Золото —</span><span class="res">Корий —</span><span class="res">O₂ —</span>
        <span class="stats"></span>
      </div>
      <div class="mode"></div>
      <div class="debug"></div>
      <div class="bottombar panel">
        <div class="mm"></div>
        <div class="selection"></div>
        <div class="commands">
          <button data-cmd="amove"><b>${key(k.attackMove)}</b>Атака-движение</button>
          <button data-cmd="patrol"><b>${key(k.patrol)}</b>Патруль</button>
          <button data-cmd="stop"><b>${key(k.stop)}</b>Стоп</button>
          <button data-cmd="hold"><b>${key(k.hold)}</b>Держать</button>
        </div>
      </div>
      <div class="help panel">
        ЛКМ / рамка — выбор · Shift — добавить · двойной клик — все такого типа<br>
        ПКМ — движение (Shift — в очередь) · Ctrl+1..9 — группа · WASD/стрелки/края — камера<br>
        Колесо — зум · СКМ — тащить карту · Пробел — пауза · +/− — скорость · F3 — отладка · F4 — пути · F6 — +50 юнитов
      </div>`;
    root.querySelector('.mm')!.appendChild(minimap);
    this.stats = root.querySelector('.stats')!;
    this.sel = root.querySelector('.selection')!;
    this.mode = root.querySelector('.mode')!;
    this.debug = root.querySelector('.debug')!;
    root.querySelectorAll<HTMLButtonElement>('button[data-cmd]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', () => {
        const c = b.dataset.cmd!;
        if (c === 'stop') game.stop();
        else if (c === 'hold') game.hold();
        else if (game.selection.size) game.pendingMode = c as 'amove' | 'patrol';
      });
    });
    root.querySelectorAll('.panel').forEach((p) => p.addEventListener('pointerdown', (e) => e.stopPropagation()));
  }

  update(info: { fps: number; tick: number; speed: number; paused: boolean; units: number; simMs: number; renderMs: number }): void {
    this.mode.textContent = this.game.pendingMode ? MODE_NAMES[this.game.pendingMode]! : '';
    const now = performance.now();
    if (now - this.last < 200) return;
    this.last = now;
    this.stats.textContent = `${info.paused ? '⏸ ПАУЗА · ' : ''}x${info.speed} · ${info.fps} FPS`;
    this.debug.style.display = this.debugVisible ? 'block' : 'none';
    if (this.debugVisible) {
      this.debug.textContent = `тик ${info.tick} · юнитов ${info.units} · sim ${info.simMs.toFixed(2)} мс/тик · кадр ${info.renderMs.toFixed(2)} мс`;
    }
    const counts = new Map<number, number>();
    for (const e of this.game.selection) counts.set(Unit.def[e]!, (counts.get(Unit.def[e]!) ?? 0) + 1);
    if (counts.size === 0) {
      this.sel.innerHTML = '<span class="empty">Ничего не выбрано</span>';
    } else {
      this.sel.innerHTML = [...counts].map(([d, n]) => {
        const u = this.reg.units[d]!.raw;
        return `<div class="card"><div class="name">${u.name}</div><div class="meta">${u.role} · HP ${u.hp} · броня ${u.armor}</div><div class="count">×${n}</div></div>`;
      }).join('');
    }
  }
}
