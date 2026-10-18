import { hasComponent } from 'bitecs';
import type { Registry } from '../data/registry';
import type { GameController } from '../game';
import { iconOf, type Sprites } from '../render/sprites';
import { Building, Harvester, Health, Owner, Unit, Weapon } from '../sim/components';
import { unitQuery, type SimWorld } from '../sim/world';

const MODE: Record<string, string> = { amove: 'АТАКА: ЛКМ — КУДА', patrol: 'ПАТРУЛЬ: ЛКМ — КУДА' };
const key = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '');

/** HUD в стиле 8-bit: пиксельный шрифт, рамки «ступеньками», иконки из тех же спрайтов. */
export class Hud {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly buildBtns: { btn: HTMLButtonElement; def: number; bar: HTMLElement; badge: HTMLElement }[] = [];
  private last = 0;
  private alertUntil = 0;
  debugVisible = false;
  helpVisible = true;
  private ended = false;

  constructor(
    root: HTMLElement,
    private readonly reg: Registry,
    private readonly game: GameController,
    private readonly sprites: Sprites,
    minimap: HTMLCanvasElement,
    hooks: { build(slot: number): void; restart(): void },
  ) {
    const c = reg.hotkeys.commands;
    root.innerHTML = `
      <div class="top px-box">
        <span class="metal">◆ <b data-k="metal">0</b></span>
        <span>ЮНИТЫ <b data-k="units">0</b></span>
        <span data-k="clock">00:00</span>
        <span class="right" data-k="speed"></span>
      </div>
      <div class="alert" data-k="alert"></div>
      <div class="mode" data-k="mode"></div>
      <div class="debug" data-k="debug"></div>
      <div class="bottom px-box">
        <div class="mm px-inset"></div>
        <div class="info px-inset" data-k="info"></div>
        <div class="build" data-k="build"></div>
        <div class="cmds">
          <button data-cmd="amove"><i>${key(c.attackMove)}</i>АТАКА</button>
          <button data-cmd="patrol"><i>${key(c.patrol)}</i>ПАТРУЛЬ</button>
          <button data-cmd="stop"><i>${key(c.stop)}</i>СТОП</button>
          <button data-cmd="hold"><i>${key(c.hold)}</i>ДЕРЖАТЬ</button>
        </div>
      </div>
      <div class="help px-box" data-k="help">
        <h2>МОРСКИЕ ТИТАНЫ</h2>
        <p>Уничтожь красный командный центр.</p>
        <p><b>ЛКМ</b>/рамка — выбор · <b>ПКМ</b> — идти, атаковать, добывать</p>
        <p><b>Q E R T</b> — строить · <b>F</b> атака · <b>X</b> стоп · <b>H</b> держать</p>
        <p><b>WASD</b>/края — камера · <b>Ctrl+1..9</b> — группы · <b>Home</b> — к базе</p>
        <p><b>Пробел</b> — пауза · <b>+/−</b> — скорость · <b>M</b> — звук · <b>F1</b> — справка</p>
        <button data-k="helpClose">В БОЙ!</button>
      </div>
      <div class="end" data-k="end"><div class="px-box"><h1 data-k="endTitle"></h1><p data-k="endText"></p><button data-k="restart">НОВАЯ ПАРТИЯ</button></div></div>`;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => { this.el[n.dataset.k!] = n; });
    root.querySelector('.mm')!.appendChild(minimap);

    const hq = reg.unitById.get('ws_hq')!;
    hq.produces.forEach((def, slot) => {
      const d = reg.units[def]!;
      const btn = document.createElement('button');
      btn.className = 'bbtn';
      const icon = iconOf(sprites.units.get(d.raw.sprite)!, game.player, d.raw.sprite === 'cruiser' ? 1 : 2);
      icon.className = 'icon';
      btn.appendChild(icon);
      btn.insertAdjacentHTML('beforeend', `<span class="name">${d.raw.name}</span><span class="cost">◆${d.raw.cost}</span><i>${key(reg.hotkeys.build[slot] ?? '')}</i><span class="badge"></span><span class="bar"></span>`);
      btn.title = `${d.raw.name}: ${d.raw.role}. ПКМ — отменить последний заказ`;
      btn.addEventListener('click', () => hooks.build(slot));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); game.cancel(); });
      this.el.build!.appendChild(btn);
      this.buildBtns.push({ btn, def, bar: btn.querySelector('.bar')!, badge: btn.querySelector('.badge')! });
    });
    root.querySelectorAll<HTMLButtonElement>('button[data-cmd]').forEach((b) => b.addEventListener('click', () => {
      const cmd = b.dataset.cmd!;
      if (cmd === 'stop') game.stop(); else if (cmd === 'hold') game.hold();
      else if (game.selection.size) game.pendingMode = cmd as 'amove' | 'patrol';
    }));
    this.el.helpClose!.addEventListener('click', () => this.toggleHelp(false));
    this.el.restart!.addEventListener('click', () => hooks.restart());
    root.querySelectorAll('.px-box, .end').forEach((p) => p.addEventListener('pointerdown', (e) => e.stopPropagation()));
  }

  /** Высоты панелей в CSS-пикселях — чтобы камера не прятала карту под ними. */
  insets(): [number, number] {
    return [this.el.alert!.parentElement!.querySelector('.top')!.getBoundingClientRect().height, this.el.alert!.parentElement!.querySelector('.bottom')!.getBoundingClientRect().height];
  }

  toggleHelp(v = !this.helpVisible): void {
    this.helpVisible = v;
    this.el.help!.hidden = !v;
  }

  alert(text: string): void {
    this.el.alert!.textContent = text;
    this.alertUntil = performance.now() + 2500;
  }

  end(win: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.el.end!.classList.add('show', win ? 'win' : 'lose');
    this.el.endTitle!.textContent = win ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
    this.el.endText!.textContent = win ? 'Командный центр Осьминогов на дне.' : 'Наша база уничтожена.';
  }

  update(sim: SimWorld, info: { fps: number; speed: number; paused: boolean; muted: boolean; simMs: number }): void {
    const now = performance.now();
    this.el.alert!.classList.toggle('show', now < this.alertUntil && Math.floor(now / 250) % 2 === 0);
    this.el.mode!.textContent = this.game.pendingMode ? MODE[this.game.pendingMode]! : '';
    if (now - this.last < 120) return;
    this.last = now;
    const ps = sim.players[this.game.player]!;
    this.el.metal!.textContent = String(ps.metal);
    this.el.units!.textContent = `${this.ownUnits(sim)}/${this.reg.game.economy.unitCap}`;
    const secs = Math.floor(sim.tick / this.reg.game.tickRate);
    this.el.clock!.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    this.el.speed!.textContent = `${info.paused ? 'ПАУЗА ' : ''}x${info.speed}${info.muted ? ' 🔇' : ''}`;
    this.el.debug!.hidden = !this.debugVisible;
    if (this.debugVisible) this.el.debug!.textContent = `${info.fps} FPS · тик ${sim.tick} · sim ${info.simMs.toFixed(2)} мс`;

    // производство
    const b = this.game.base();
    const prod = b >= 0 ? sim.prod.get(b) : undefined;
    for (const bb of this.buildBtns) {
      const d = this.reg.units[bb.def]!;
      const queued = prod?.queue.filter((q) => q === bb.def).length ?? 0;
      bb.badge.textContent = queued ? String(queued) : '';
      bb.btn.classList.toggle('poor', ps.metal < d.raw.cost);
      const current = prod && prod.queue[0] === bb.def ? prod.progress / d.buildTicks : 0;
      bb.bar.style.width = `${Math.round(current * 100)}%`;
    }
    this.renderInfo(sim);
  }

  /** Число выделенных юнитов по типам. */
  private counts(): Map<number, number> {
    const m = new Map<number, number>();
    for (const e of this.game.selection) m.set(Unit.def[e]!, (m.get(Unit.def[e]!) ?? 0) + 1);
    return m;
  }

  private ownUnits(sim: SimWorld): number {
    const ents = unitQuery(sim.ecs);
    let n = 0;
    for (let i = 0; i < ents.length; i++) if (Owner.player[ents[i]!] === this.game.player && !hasComponent(sim.ecs, Building, ents[i]!)) n++;
    return n;
  }

  private renderInfo(sim: SimWorld): void {
    const sel = [...this.game.selection];
    const info = this.el.info!;
    if (sel.length === 0) { info.innerHTML = '<span class="dim">Выбери лодку или базу</span>'; return; }
    if (sel.length === 1) {
      const e = sel[0]!;
      const d = this.reg.units[Unit.def[e]!]!;
      const hp = Health.hp[e]!, max = Health.maxHp[e]!;
      const extra: string[] = [];
      if (d.raw.weapon) extra.push(`УРОН ${d.raw.weapon.damage} · ДАЛЬН ${d.raw.weapon.range}`);
      if (hasComponent(sim.ecs, Harvester, e)) extra.push(`ГРУЗ ${Harvester.carry[e]}/${d.raw.harvest!.capacity}`);
      if (hasComponent(sim.ecs, Building, e)) {
        const p = sim.prod.get(e);
        extra.push(p && p.queue.length ? `СТРОИТ: ${p.queue.map((q) => this.reg.units[q]!.raw.name).join(', ')}` : 'ОЧЕРЕДЬ ПУСТА');
      }
      info.innerHTML = `<div class="one"><canvas class="big"></canvas><div><b>${d.raw.name}</b><div class="dim">${d.raw.role}</div>
        <div class="hp"><span style="width:${Math.round((hp / max) * 100)}%"></span></div><div>${hp}/${max} · БРОНЯ ${d.raw.armor}</div><div class="dim">${extra.join('<br>')}</div></div></div>`;
      const big = info.querySelector<HTMLCanvasElement>('canvas.big')!;
      const icon = iconOf(this.sprites.units.get(d.raw.sprite)!, Owner.player[e]!, 3);
      big.width = icon.width; big.height = icon.height;
      big.getContext('2d')!.drawImage(icon, 0, 0);
      return;
    }
    const m = this.counts();
    info.innerHTML = `<div class="many">${[...m].map(([d, k]) => `<span>${this.reg.units[d]!.raw.name} ×${k}</span>`).join('')}</div>
      <div class="dim">${sel.filter((e) => hasComponent(sim.ecs, Weapon, e)).length} боевых</div>`;
  }
}
