import gameJson from '../../data/game.json';
import hotkeysJson from '../../data/hotkeys.json';
import wsUnitsJson from '../../data/factions/white_sharks/units.json';
import biomesJson from '../../data/render/biomes.json';
import manifestJson from '../../assets/manifest.json';
import { degPerSecToTick, tilesPerSecToTick, toFixed } from '../core/fixed';
import {
  AssetManifestSchema, GameConfigSchema, HotkeysSchema, RenderConfigSchema, UnitDefSchema,
  type AssetManifest, type GameConfig, type Hotkeys, type RenderConfig, type UnitDefRaw,
} from './schema';
import { z } from 'zod';
import { sizeClassOf } from '../sim/map/grid';

export const LAYERS = ['low', 'mid', 'high'] as const;

/** Юнит в «симуляционных» единицах: fixed-point и тики. */
export interface UnitDef {
  index: number;
  raw: UnitDefRaw;
  speed: number;      // fixed за тик
  turnRate: number;   // u16 за тик
  radius: number;     // fixed
  layer: number;      // индекс в LAYERS
  sizeClass: number;  // класс размера для поиска пути
}

export interface Registry {
  game: GameConfig;
  hotkeys: Hotkeys;
  render: RenderConfig;
  manifest: AssetManifest;
  units: UnitDef[];
  unitById: Map<string, UnitDef>;
}

export function buildRegistry(raw: {
  game: unknown; hotkeys: unknown; render: unknown; manifest: unknown; units: unknown[];
}): Registry {
  const game = GameConfigSchema.parse(raw.game);
  const hotkeys = HotkeysSchema.parse(raw.hotkeys);
  const render = RenderConfigSchema.parse(raw.render);
  const manifest = AssetManifestSchema.parse(raw.manifest);
  const unitsRaw = z.array(UnitDefSchema).parse(raw.units);

  const units: UnitDef[] = unitsRaw.map((u, index) => ({
    index,
    raw: u,
    speed: tilesPerSecToTick(u.speed, game.tickRate),
    turnRate: degPerSecToTick(u.turnRate, game.tickRate),
    radius: toFixed(u.radius),
    layer: LAYERS.indexOf(u.layer),
    sizeClass: sizeClassOf(u.radius),
  }));
  const unitById = new Map(units.map((u) => [u.raw.id, u]));
  if (unitById.size !== units.length) throw new Error('Дублирующиеся id юнитов в конфигах');
  for (const u of units) {
    if (!manifest[u.raw.sprite]) throw new Error(`Юнит ${u.raw.id}: спрайт «${u.raw.sprite}» не найден в assets/manifest.json`);
  }
  if (game.defaultSpeedIndex >= game.speedSteps.length) throw new Error('defaultSpeedIndex вне speedSteps');
  return { game, hotkeys, render, manifest, units, unitById };
}

let cached: Registry | null = null;

/** Реестр из встроенных JSON (Vite и Vitest импортируют их напрямую). */
export function loadRegistry(): Registry {
  cached ??= buildRegistry({
    game: gameJson, hotkeys: hotkeysJson, render: biomesJson, manifest: manifestJson, units: [...wsUnitsJson],
  });
  return cached;
}
