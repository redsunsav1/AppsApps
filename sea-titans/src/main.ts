import { Application, Container, Graphics } from 'pixi.js';
import { fcos, fsin, toFixed } from './core/fixed';
import { GameLoop } from './core/loop';
import { loadRegistry } from './data/registry';
import { GameController } from './game';
import { Input } from './input/input';
import { Camera } from './render/camera';
import { DebugDraw } from './render/debug';
import { EntityRenderer } from './render/entities';
import { Atmosphere, WorldFx, markerTexture } from './render/fx/atmosphere';
import { HeightField, Iso } from './render/iso';
import { bubbleTexture, buildSprites, softDot } from './render/sprites';
import { buildTerrain } from './render/terrain';
import { Facing, Mover, Position, Unit } from './sim/components';
import { generateTestMap } from './sim/map/testmap';
import { step } from './sim/step';
import { createSimWorld, spawnUnit, unitQuery, type SimWorld } from './sim/world';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';

const ORDER_COLORS = { move: 0x6dff9e, amove: 0xff6a5a, patrol: 0x6dc8ff } as const;

/** Расставляет отряд по спирали вокруг точки на свободных клетках. */
function spawnSquad(w: SimWorld, player: number, cx: number, cy: number, kinds: string[], n: number, facing: number): number[] {
  const out: number[] = [];
  let r = 0, a = 0;
  for (let guard = 0; out.length < n && guard < n * 50; guard++) {
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    a += 1.6 / Math.max(1, r);
    r += 0.12;
    if (w.grid.blockedFor(1)[w.grid.idx(Math.floor(x), Math.floor(y))] || w.grid.isBlocked(Math.floor(x), Math.floor(y))) continue;
    if (out.some((e) => Math.hypot(Position.x[e]! / 1024 - x, Position.y[e]! / 1024 - y) < 1.5)) continue;
    out.push(spawnUnit(w, kinds[out.length % kinds.length]!, player, toFixed(x), toFixed(y), facing));
  }
  return out;
}

async function main(): Promise<void> {
  const reg = loadRegistry();
  const params = new URLSearchParams(location.search);
  const size = Number(params.get('map')) || reg.game.testMap.width;
  const seed = Number(params.get('seed')) || reg.game.testMap.seed;
  const unitCount = Number(params.get('units')) || 30;

  const { grid, spawns } = generateTestMap(size, size, seed);
  const sim = createSimWorld(reg, grid, seed);
  const mix = ['ws_hunter', 'ws_scout', 'ws_hunter', 'ws_cruiser', 'ws_hunter'];
  spawnSquad(sim, 0, spawns[0]!.x, spawns[0]!.y, mix, unitCount, 0);
  spawnSquad(sim, 1, spawns[1]!.x, spawns[1]!.y, mix, 12, 32768);

  const app = new Application();
  await app.init({
    resizeTo: window, background: '#02121c', antialias: true, preference: 'webgl',
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  document.getElementById('game')!.appendChild(app.canvas);

  const rc = reg.render;
  const iso = new Iso(rc.tileWidth, rc.tileHeight, rc.heightPixels);
  const heights = new HeightField(grid);
  const terrain = buildTerrain(grid, heights, iso, rc);
  const sprites = buildSprites(reg.manifest, rc.tileWidth);

  const world = new Container();
  const shadowLayer = new Container();
  const unitLayer = new Container();
  unitLayer.sortableChildren = true;
  const fx = new WorldFx(bubbleTexture(), markerTexture());
  const debug = new DebugDraw(iso, heights);
  world.addChild(terrain.mesh, debug.blockedG, shadowLayer, fx.root, unitLayer, debug.g);
  const atmosphere = new Atmosphere();
  const overlay = new Graphics();
  app.stage.addChild(world, atmosphere.root, overlay);

  const camera = new Camera(reg.game.camera, {
    minX: -grid.h * iso.hw, maxX: grid.width * iso.hw, minY: 0, maxY: (grid.width + grid.h) * iso.hh,
  });
  camera.centerOn(iso.x(spawns[0]!.x, spawns[0]!.y), iso.y(spawns[0]!.x, spawns[0]!.y));

  const entities = new EntityRenderer(reg, sprites, iso, heights, shadowLayer, unitLayer, softDot(64, 'rgba(0,8,14,0.9)', 'rgba(0,8,14,0)'));
  const game = new GameController(sim, reg, camera, iso, heights, entities);
  game.onOrder = (tx, ty, mode) => fx.marker(iso.x(tx, ty), iso.y(tx, ty, Math.max(0, heights.sample(tx, ty))), ORDER_COLORS[mode]);
  const minimap = new Minimap(grid, rc, camera, iso);
  const hud = new Hud(document.getElementById('hud')!, reg, game, minimap.canvas);

  let speedIdx = reg.game.defaultSpeedIndex;
  let simMs = 0;
  const loop = new GameLoop(
    reg.game.tickRate,
    () => {
      const t0 = performance.now();
      step(sim);
      simMs = simMs * 0.9 + (performance.now() - t0) * 0.1;
    },
    (alpha, dtMs) => render(alpha, dtMs),
  );
  loop.speed = reg.game.speedSteps[speedIdx]!;

  const input = new Input(app.canvas, game, camera, iso, reg.hotkeys, reg.game.camera, {
    togglePause: () => { loop.paused = !loop.paused; },
    speed: (d) => { speedIdx = Math.max(0, Math.min(reg.game.speedSteps.length - 1, speedIdx + d)); loop.speed = reg.game.speedSteps[speedIdx]!; },
    toggleDebug: () => { hud.debugVisible = !hud.debugVisible; },
    toggleDebugPaths: () => { debug.enabled = !debug.enabled; },
    stress: () => {
      const s = spawns[0]!;
      spawnSquad(sim, 0, s.x + sim.rng.int(9) - 4, s.y + sim.rng.int(9) - 4, mix, 50, 0);
    },
  });

  const resize = () => { camera.resize(app.screen.width, app.screen.height); atmosphere.resize(app.screen.width, app.screen.height); };
  resize();
  window.addEventListener('resize', resize);

  let time = 0;
  let fps = 60;
  let lastCamX = camera.x, lastCamY = camera.y;
  function render(alpha: number, dtMs: number): void {
    const t0 = performance.now();
    const dt = dtMs / 1000;
    time += dt;
    fps = fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    input.update(dt);
    camera.apply(world);
    game.pruneSelection();
    entities.sync(sim, alpha, game.selection);
    terrain.setTime(time);

    // пузыри за кормой движущихся лодок
    const ents = unitQuery(sim.ecs);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i]!;
      const cur = Mover.cur[e]!;
      if (cur * 3 < Mover.speed[e]! || Math.random() > 0.35) continue;
      const def = reg.units[Unit.def[e]!]!;
      const len = (sprites.get(def.raw.sprite)?.length ?? 1) * 0.55;
      const a = Facing.angle[e]!;
      const x = Position.x[e]! / 1024 - (fcos(a) / 1024) * len;
      const y = Position.y[e]! / 1024 - (fsin(a) / 1024) * len;
      const hover = rc.layerHeightPixels[(['low', 'mid', 'high'] as const)[Mover.layer[e]!]!] ?? 20;
      fx.emitBubble(iso.x(x, y), iso.y(x, y, Math.max(0, heights.sample(x, y))) - hover, 0.6 + len * 0.5);
    }
    fx.update(dt);
    debug.draw(sim);

    atmosphere.update(time, dt, (camera.x - lastCamX) * camera.zoom, (camera.y - lastCamY) * camera.zoom);
    lastCamX = camera.x; lastCamY = camera.y;

    overlay.clear();
    if (input.box) {
      const b = input.box;
      overlay.rect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0))
        .fill({ color: 0x6dff9e, alpha: 0.08 }).stroke({ width: 1, color: 0x6dff9e, alpha: 0.9 });
    }
    minimap.draw(sim);
    hud.update({ fps: Math.round(fps), tick: sim.tick, speed: loop.speed, paused: loop.paused, units: ents.length, simMs, renderMs: performance.now() - t0 });
  }

  loop.start();
  // доступ из консоли для отладки
  (window as unknown as Record<string, unknown>).__game = { sim, game, camera, loop };
}

main().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;padding:20px;position:fixed;top:40px">${String(err?.stack ?? err)}</pre>`);
});
