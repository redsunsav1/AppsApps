import { entityExists, hasComponent } from 'bitecs';
import { KINDS, type Registry, type UnitDef } from '../data/registry';
import type { Pilot } from '../data/schema';
import type { GameController } from '../game';
import { buildPortrait, PORTRAIT, type PortraitFrames } from '../render/portrait';
import { iconOf, type Sprites } from '../render/sprites';
import { Building, Harvester, Health, Owner, Unit } from '../sim/components';
import { unitQuery, type SimWorld } from '../sim/world';
import { KIND_NAMES, roleIcon } from './icons';

export type LineKind = 'select' | 'move' | 'attack' | 'hurt' | 'built';
const MODE: Record<string, string> = { amove: 'АТАКА: ЛКМ — КУДА', patrol: 'ПАТРУЛЬ: ЛКМ — КУДА' };
const key = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '');
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

/** Экран связи с пилотом: моргает, говорит (рот двигается, текст печатается). */
class PilotScreen {
  readonly root: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly nameEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private frames: PortraitFrames | null = null;
  private text = '';
  private shown = 0;
  private talkUntil = 0;
  private nextBlink = 0;
  private blinkUntil = 0;
  private lastType = 0;

  constructor(cls: string) {
    this.root = document.createElement('div');
    this.root.className = `pilot ${cls}`;
    this.root.innerHTML = `<div class="screen px-inset"><canvas width="${PORTRAIT}" height="${PORTRAIT}"></canvas></div><div class="who"><b></b><div class="say"></div></div>`;
    this.ctx = this.root.querySelector('canvas')!.getContext('2d')!;
    this.nameEl = this.root.querySelector('.who b')!;
    this.textEl = this.root.querySelector('.say')!;
  }

  set(frames: PortraitFrames | null, name: string, rank: string): void {
    if (this.frames !== frames) { this.frames = frames; this.text = ''; this.shown = 0; this.textEl.textContent = ''; }
    this.nameEl.innerHTML = frames ? `${name}<span>${rank}</span>` : '';
    this.root.classList.toggle('empty', !frames);
  }

  say(line: string): void {
    this.text = `«${line}»`;
    this.shown = 0;
    this.talkUntil = performance.now() + 250 + line.length * 45;
  }

  tick(now: number): void {
    if (!this.frames) { this.ctx.clearRect(0, 0, PORTRAIT, PORTRAIT); return; }
    if (now > this.nextBlink) { this.blinkUntil = now + 130; this.nextBlink = now + 2200 + Math.random() * 3000; }
    let f = 0;
    if (now < this.talkUntil) f = Math.floor(now / 95) % 3 === 0 ? 0 : Math.floor(now / 95) % 3 === 1 ? 2 : 3;
    else if (now < this.blinkUntil) f = 1;
    this.ctx.drawImage(this.frames[f]!, 0, 0);
    if (this.shown < this.text.length && now - this.lastType > 28) {
      this.lastType = now;
      this.shown++;
      this.textEl.textContent = this.text.slice(0, this.shown);
    }
  }
}

/** HUD: пиксельный шрифт, панели-«ступеньки», портреты пилотов, карточки ролей. */
export class Hud {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly buildBtns: { btn: HTMLButtonElement; def: number; bar: HTMLElement; badge: HTMLElement }[] = [];
  private readonly portraits = new Map<string, PortraitFrames>();
  private readonly pilot = new PilotScreen('main');
  private readonly radio = new PilotScreen('radio');
  private radioUntil = 0;
  private last = 0;
  private alertUntil = 0;
  private infoKey = '';
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
        <span class="metal"><i class="gem"></i><b data-k="metal">0</b></span>
        <span>ФЛОТ <b data-k="units">0</b></span>
        <span data-k="clock">00:00</span>
        <span class="right" data-k="speed"></span>
      </div>
      <div class="alert" data-k="alert"></div>
      <div class="mode" data-k="mode"></div>
      <div class="debug" data-k="debug"></div>
      <div class="radiobox px-box" data-k="radio"></div>
      <div class="bottom px-box">
        <div class="mm px-inset"></div>
        <div class="pilotbox" data-k="pilot"></div>
        <div class="info px-inset" data-k="info"></div>
        <div class="build" data-k="build"></div>
        <div class="cmds">
          <button data-cmd="amove"><i>${key(c.attackMove)}</i>АТАКА</button>
          <button data-cmd="patrol"><i>${key(c.patrol)}</i>ПАТРУЛЬ</button>
          <button data-cmd="stop"><i>${key(c.stop)}</i>СТОП</button>
          <button data-cmd="hold"><i>${key(c.hold)}</i>ДЕРЖАТЬ</button>
        </div>
      </div>
      <div class="tip px-box" data-k="tip" hidden></div>
      <div class="help px-box" data-k="help">
        <h2>МОРСКИЕ ТИТАНЫ</h2>
        <p>Цель — потопить красный командный центр Осьминогов.</p>
        <p><b>ЛКМ</b>/рамка — выбор · <b>ПКМ</b> — плыть, атаковать, добывать кристаллы</p>
        <p><b>Q E R T</b> — строить · <b>F</b> атака · <b>X</b> стоп · <b>H</b> держать</p>
        <p><b>WASD</b>/края — камера · <b>Ctrl+1..9</b> — группы · <b>Home</b> — к базе</p>
        <p><b>Пробел</b> — пауза · <b>+/−</b> — скорость · <b>M</b> — звук · <b>F1</b> — справка</p>
        <p class="dim">Наведи на кнопку постройки — увидишь, кто против кого силён.</p>
        <button data-k="helpClose">В БОЙ!</button>
      </div>
      <div class="end" data-k="end"><div class="px-box"><h1 data-k="endTitle"></h1><p data-k="endText"></p><button data-k="restart">НОВАЯ ПАРТИЯ</button></div></div>`;
    root.querySelectorAll<HTMLElement>('[data-k]').forEach((n) => { this.el[n.dataset.k!] = n; });
    root.querySelector('.mm')!.appendChild(minimap);
    this.el.pilot!.appendChild(this.pilot.root);
    this.el.radio!.appendChild(this.radio.root);
    this.el.radio!.hidden = true;

    const hq = reg.unitById.get('ws_hq')!;
    hq.produces.forEach((def, slot) => {
      const d = reg.units[def]!;
      const btn = document.createElement('button');
      btn.className = 'bbtn';
      const icon = iconOf(sprites.units.get(d.raw.sprite)!, game.player, d.raw.sprite === 'cruiser' ? 1 : 2);
      icon.className = 'icon';
      const role = roleIcon(d.raw.icon, 2);
      role.className = 'role';
      btn.append(role, icon);
      btn.insertAdjacentHTML('beforeend', `<span class="name">${d.raw.name}</span><span class="cost"><i class="gem"></i>${d.raw.cost}</span><i class="hk">${key(reg.hotkeys.build[slot] ?? '')}</i><span class="badge"></span><span class="bar"></span>`);
      btn.addEventListener('click', () => hooks.build(slot));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); game.cancel(); });
      btn.addEventListener('pointerenter', () => this.showTip(btn, d));
      btn.addEventListener('pointerleave', () => { this.el.tip!.hidden = true; });
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

  private pilotOf(team: number, def: UnitDef): Pilot {
    return this.reg.pilots.teams[team]![def.raw.id]!;
  }

  private portrait(team: number, def: UnitDef): PortraitFrames {
    const k = `${team}:${def.raw.id}`;
    let p = this.portraits.get(k);
    if (!p) {
      p = buildPortrait(this.pilotOf(team, def).look, this.sprites.teams[team]!.main, this.sprites.colors, team !== this.game.player);
      this.portraits.set(k, p);
    }
    return p;
  }

  /** Реплика пилота первого выбранного юнита. */
  speak(kind: LineKind): void {
    const e = [...this.game.selection].find((x) => Owner.player[x] === this.game.player) ?? [...this.game.selection][0];
    if (e === undefined) return;
    const def = this.reg.units[Unit.def[e]!]!;
    this.syncPilot(e);
    this.pilot.say(pick(this.pilotOf(Owner.player[e]!, def).lines[kind]));
  }

  /** Сообщение по рации (не зависит от выбора): тревога, лодка построена. */
  radioSay(team: number, defIndex: number, kind: LineKind): void {
    const def = this.reg.units[defIndex]!;
    const p = this.pilotOf(team, def);
    this.radio.set(this.portrait(team, def), p.name, p.rank);
    this.radio.say(pick(p.lines[kind]));
    this.el.radio!.hidden = false;
    this.radioUntil = performance.now() + 3600;
  }

  private syncPilot(e: number | undefined): void {
    if (e === undefined) { this.pilot.set(null, '', ''); return; }
    const team = Owner.player[e]!;
    const def = this.reg.units[Unit.def[e]!]!;
    const p = this.pilotOf(team, def);
    this.pilot.set(this.portrait(team, def), p.name, p.rank);
  }

  private showTip(btn: HTMLElement, d: UnitDef): void {
    const tip = this.el.tip!;
    tip.innerHTML = this.card(d, null);
    tip.hidden = false;
    const r = btn.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(window.innerWidth - 340, r.left + r.width / 2 - 160))}px`;
    tip.style.bottom = `${window.innerHeight - r.top + 14}px`;
  }

  /** Карточка юнита: роль, описание, цифры, против кого силён и слаб. */
  private card(d: UnitDef, e: number | null): string {
    const w = d.raw.weapon;
    const kinds = (list: string[]) => list.map((k) => KIND_NAMES[k] ?? k).join(', ');
    const bonus = KINDS.map((k, i) => (d.bonus[i]! !== 100 ? `×${(d.bonus[i]! / 100).toFixed(1)} по: ${KIND_NAMES[k]}` : '')).filter(Boolean).join(' · ');
    const hp = e !== null ? Health.hp[e]! : d.raw.hp;
    return `<div class="card">
      <div class="title"><b>${d.raw.name}</b><span class="tag tag-${d.raw.icon}">${d.raw.role}</span></div>
      <div class="desc">${d.raw.description}</div>
      <div class="stats">
        <span>ПРОЧН <b>${hp}/${d.raw.hp}</b></span><span>БРОНЯ <b>${d.raw.armor}</b></span>
        ${w ? `<span>УРОН <b>${w.damage}${w.splash ? ' по площади' : ''}</b></span><span>ДАЛЬН <b>${w.range}</b></span>` : ''}
        ${d.raw.speed ? `<span>СКОР <b>${d.raw.speed}</b></span>` : ''}
        ${d.raw.cost ? `<span>ЦЕНА <b>${d.raw.cost}</b></span>` : ''}
      </div>
      ${d.raw.strong.length ? `<div class="good">▲ Силён против: ${kinds(d.raw.strong)}</div>` : ''}
      ${d.raw.weak.length ? `<div class="bad">▼ Уязвим для: ${kinds(d.raw.weak)}</div>` : ''}
      ${bonus ? `<div class="dim">${bonus}</div>` : ''}
    </div>`;
  }

  insets(): [number, number] {
    const root = this.el.alert!.parentElement!;
    return [root.querySelector('.top')!.getBoundingClientRect().height, root.querySelector('.bottom')!.getBoundingClientRect().height];
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
    this.el.endText!.textContent = win ? 'Логово Осьминогов на дне. Флот возвращается домой.' : 'Наш командный центр уничтожен.';
  }

  update(sim: SimWorld, info: { fps: number; speed: number; paused: boolean; muted: boolean; simMs: number }): void {
    const now = performance.now();
    this.pilot.tick(now);
    if (!this.el.radio!.hidden) { this.radio.tick(now); if (now > this.radioUntil) this.el.radio!.hidden = true; }
    this.el.alert!.classList.toggle('show', now < this.alertUntil && Math.floor(now / 250) % 2 === 0);
    this.el.mode!.textContent = this.game.pendingMode ? MODE[this.game.pendingMode]! : '';
    if (now - this.last < 150) return;
    this.last = now;
    const ps = sim.players[this.game.player]!;
    this.el.metal!.textContent = String(ps.metal);
    this.el.units!.textContent = `${this.ownUnits(sim)}/${this.reg.game.economy.unitCap}`;
    const secs = Math.floor(sim.tick / this.reg.game.tickRate);
    this.el.clock!.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    this.el.speed!.textContent = `${info.paused ? 'ПАУЗА · ' : ''}x${info.speed}${info.muted ? ' · БЕЗ ЗВУКА' : ''}`;
    this.el.debug!.hidden = !this.debugVisible;
    if (this.debugVisible) this.el.debug!.textContent = `${info.fps} FPS · тик ${sim.tick} · sim ${info.simMs.toFixed(2)} мс`;

    const b = this.game.base();
    const prod = b >= 0 ? sim.prod.get(b) : undefined;
    for (const bb of this.buildBtns) {
      const d = this.reg.units[bb.def]!;
      const queued = prod?.queue.filter((q) => q === bb.def).length ?? 0;
      bb.badge.textContent = queued ? `×${queued}` : '';
      bb.btn.classList.toggle('poor', ps.metal < d.raw.cost);
      bb.bar.style.width = `${Math.round((prod && prod.queue[0] === bb.def ? prod.progress / d.buildTicks : 0) * 100)}%`;
    }
    this.renderInfo(sim);
  }

  private ownUnits(sim: SimWorld): number {
    const ents = unitQuery(sim.ecs);
    let n = 0;
    for (let i = 0; i < ents.length; i++) if (Owner.player[ents[i]!] === this.game.player && !hasComponent(sim.ecs, Building, ents[i]!)) n++;
    return n;
  }

  private renderInfo(sim: SimWorld): void {
    const sel = [...this.game.selection].filter((e) => entityExists(sim.ecs, e));
    const info = this.el.info!;
    const first = sel[0];
    this.syncPilot(first);
    if (first === undefined) {
      if (this.infoKey !== 'none') { info.innerHTML = '<div class="empty">Выбери лодку или базу.<br><span class="dim">У каждой лодки свой пилот и своя роль.</span></div>'; this.infoKey = 'none'; }
      return;
    }
    if (sel.length === 1) {
      const d = this.reg.units[Unit.def[first]!]!;
      let extra = '';
      if (hasComponent(sim.ecs, Harvester, first)) extra = `<div class="dim">Груз: ${Harvester.carry[first]}/${d.raw.harvest!.capacity}</div>`;
      if (hasComponent(sim.ecs, Building, first)) {
        const p = sim.prod.get(first);
        extra = `<div class="dim">${p && p.queue.length ? `Строит: ${p.queue.map((q) => this.reg.units[q]!.raw.name).join(', ')}` : 'Очередь пуста — жми Q E R T'}</div>`;
      }
      const k = `one:${first}:${Health.hp[first]}:${extra}`;
      if (k !== this.infoKey) { info.innerHTML = this.card(d, first) + extra; this.infoKey = k; }
      return;
    }
    const m = new Map<number, number>();
    for (const e of sel) m.set(Unit.def[e]!, (m.get(Unit.def[e]!) ?? 0) + 1);
    const k = `many:${[...m].join(';')}`;
    if (k === this.infoKey) return;
    this.infoKey = k;
    info.innerHTML = `<div class="many">${[...m].map(([d, n]) => `<span class="chip"><canvas data-d="${d}"></canvas>${this.reg.units[d]!.raw.name} ×${n}</span>`).join('')}</div><div class="dim">Выбрано: ${sel.length}. Портрет — командир группы.</div>`;
    info.querySelectorAll<HTMLCanvasElement>('canvas[data-d]').forEach((cv) => {
      const d = this.reg.units[Number(cv.dataset.d)]!;
      const ic = roleIcon(d.raw.icon, 2);
      cv.width = ic.width; cv.height = ic.height;
      cv.getContext('2d')!.drawImage(ic, 0, 0);
    });
  }
}
