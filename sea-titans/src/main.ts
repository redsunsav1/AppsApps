import { Sfx } from './audio/sfx';
import { GameLoop } from './core/loop';
import { loadRegistry } from './data/registry';
import { GameController } from './game';
import { Input } from './input/input';
import { Fog } from './render/fog';
import { Fx } from './render/fx';
import { FX_TO_PX, Renderer } from './render/renderer';
import { buildSprites } from './render/sprites';
import { renderMap } from './render/tiles';
import { createMatch } from './sim/match';
import { step } from './sim/step';
import type { SimEvent, SimWorld } from './sim/world';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

const PLAYER = 0;

function main(): void {
  const reg = loadRegistry();
  const seed = Math.floor(Math.random() * 1e9);
  const { world: sim, spawns } = createMatch(reg, { seed, ai: [false, true] });

  const sprites = buildSprites(reg.manifest, reg.palette);
  const T = reg.palette.tile;
  const mapCanvas = renderMap(sim.grid, sprites.colors, T);
  const fog = new Fog(sim.grid.width, sim.grid.h, reg);
  const fx = new Fx(sprites.colors);
  const canvas = document.createElement('canvas');
  document.getElementById('game')!.appendChild(canvas);
  const view = new Renderer(canvas, reg, sprites, mapCanvas, fog, fx, PLAYER);
  const sfx = new Sfx();

  const C = sprites.colors;
  const markerColor = { move: C.select!, amove: C.hpLow!, patrol: C.foam!, attack: C.hpLow!, harvest: C.metal!, rally: C.hazard! };
  const game = new GameController(sim, reg, view, fog, {
    ack: () => sfx.ack(), denied: () => sfx.denied(), select: () => sfx.select(),
    marker: (x, y, k) => view.marker(x, y, markerColor[k]),
  }, PLAYER);
  const minimap = new Minimap(sim.grid, sprites, fog, view, PLAYER);
  const hqDef = reg.unitById.get('ws_hq')!;
  const build = (slot: number) => { const d = hqDef.produces[slot]; if (d !== undefined) game.produce(d); };
  const hud = new Hud(document.getElementById('hud')!, reg, game, sprites, minimap.canvas, { build, restart: () => location.reload() });

  let speedIdx = reg.game.defaultSpeedIndex;
  let simMs = 0;
  const loop = new GameLoop(reg.game.tickRate, () => {
    if (sim.winner >= 0) return;
    const t0 = performance.now();
    step(sim);
    simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
  }, (alpha, dtMs) => frame(alpha, dtMs));
  loop.speed = reg.game.speedSteps[speedIdx]!;

  const input = new Input(canvas, game, view, reg.hotkeys, reg.game.camera, {
    togglePause: () => { loop.paused = !loop.paused; },
    speed: (d) => { speedIdx = Math.max(0, Math.min(reg.game.speedSteps.length - 1, speedIdx + d)); loop.speed = reg.game.speedSteps[speedIdx]!; },
    toggleDebug: () => { hud.debugVisible = !hud.debugVisible; },
    toggleMute: () => { sfx.muted = !sfx.muted; },
    toggleHelp: () => hud.toggleHelp(),
    build,
    anyInput: () => sfx.unlock(),
  });

  const resize = () => { const [top, bottom] = hud.insets(); view.resize(top, bottom); };
  resize();
  window.addEventListener('resize', resize);
  view.centerOn(spawns[PLAYER]!.x * T + 40, spawns[PLAYER]!.y * T);

  let fps = 60;
  function frame(alpha: number, dtMs: number): void {
    const dt = Math.min(0.1, dtMs / 1000);
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    input.update(dt);
    game.pruneSelection();
    fog.update(sim, PLAYER);
    handleEvents(sim);
    fx.update(loop.paused ? 0 : dt * loop.speed);
    view.draw(sim, alpha, loop.paused ? 0 : dt, game.selection);
    minimap.draw(sim);
    hud.update(sim, { fps: Math.round(fps), speed: loop.speed, paused: loop.paused, muted: sfx.muted, simMs });
  }

  /** События симуляции → эффекты и звук (только то, что игрок видит). */
  function handleEvents(w: SimWorld): void {
    const evs: SimEvent[] = w.events.splice(0);
    for (const ev of evs) {
      const at = 'x' in ev ? [ev.x / FX_TO_PX, ev.y / FX_TO_PX] as const : null;
      const seen = at ? fog.isVisible(at[0] / T, at[1] / T) && onScreen(at[0], at[1]) : true;
      switch (ev.t) {
        case 'shot': if (seen) { fx.muzzle(at![0], at![1]); sfx.shot(ev.kind); } break;
        case 'hit': if (seen) { fx.hit(at![0], at![1], ev.splash / FX_TO_PX); sfx.hit(ev.splash > 0); } break;
        case 'death': if (fog.isVisible(at![0] / T, at![1] / T)) { fx.explosion(at![0], at![1], ev.r / FX_TO_PX, ev.building); if (seen) sfx.boom(ev.building); } break;
        case 'built': if (ev.owner === PLAYER) sfx.built(); break;
        case 'deposit': if (ev.owner === PLAYER && seen) sfx.coin(); break;
        case 'alert': if (ev.owner === PLAYER) { hud.alert('АТАКА НА НАС!'); sfx.alert(); } break;
        case 'win': hud.end(ev.player === PLAYER); sfx.jingle(ev.player === PLAYER); break;
      }
    }
  }

  const onScreen = (x: number, y: number) => x >= view.camX - 16 && y >= view.camY - 16 && x <= view.camX + view.bw + 16 && y <= view.camY + view.bh + 16;

  loop.start();
  (window as unknown as Record<string, unknown>).__game = { sim, game, view, loop };
}

const start = () => {
  try { main(); } catch (err) {
    console.error(err);
    document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:20px;position:fixed;top:40px;white-space:pre-wrap">${String((err as Error)?.stack ?? err)}</pre>`);
  }
};
// ждём пиксельный шрифт, чтобы HUD не «прыгнул» после загрузки
if (document.fonts?.load) Promise.race([document.fonts.load('10px "Press Start 2P"'), new Promise((r) => setTimeout(r, 1500))]).finally(start);
else start();
