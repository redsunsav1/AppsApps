import gameJson from '../../data/game.json';
import hotkeysJson from '../../data/hotkeys.json';
import wsUnitsJson from '../../data/factions/white_sharks/units.json';
import paletteJson from '../../data/render/palette.json';
import manifestJson from '../../assets/manifest.json';
import { tilesPerSecToTick, toFixed } from '../core/fixed';
import {
  AssetManifestSchema, GameConfigSchema, HotkeysSchema, PaletteSchema, UnitDefSchema,
  type AssetManifest, type GameConfig, type Hotkeys, type Palette, type UnitDefRaw,
} from './schema';
import { z } from 'zod';
import { sizeClassOf } from '../sim/map/grid';

export const LAYERS = ['low', 'mid', 'high'] as const;
export const PROJECTILES = ['pulse', 'torpedo', 'shell'] as const;

/** Оружие в единицах симуляции. */
export interface WeaponDef {
  damage: number;
  range: number;       // fixed
  cooldown: number;    // тики
  speed: number;       // fixed за тик
  splash: number;      // fixed
  kind: number;        // индекс в PROJECTILES
}

/** Юнит/здание в «симуляционных» единицах: fixed-point и тики. */
export interface UnitDef {
  index: number;
  raw: UnitDefRaw;
  speed: number;
  radius: number;
  sight: number;
  layer: number;
  sizeClass: number;
  buildTicks: number;
  weapon: WeaponDef | null;
  /** Тиков на одну единицу металла при добыче. */
  harvestTicksPerUnit: number;
  produces: number[];
}

export interface Registry {
  game: GameConfig;
  hotkeys: Hotkeys;
  palette: Palette;
  manifest: AssetManifest;
  units: UnitDef[];
  unitById: Map<string, UnitDef>;
}

export function buildRegistry(raw: {
  game: unknown; hotkeys: unknown; palette: unknown; manifest: unknown; units: unknown[];
}): Registry {
  const game = GameConfigSchema.parse(raw.game);
  const hotkeys = HotkeysSchema.parse(raw.hotkeys);
  const palette = PaletteSchema.parse(raw.palette);
  const manifest = AssetManifestSchema.parse(raw.manifest);
  const unitsRaw = z.array(UnitDefSchema).parse(raw.units);
  const tr = game.tickRate;

  const units: UnitDef[] = unitsRaw.map((u, index) => ({
    index,
    raw: u,
    speed: tilesPerSecToTick(u.speed, tr),
    radius: toFixed(u.radius),
    sight: toFixed(u.sight),
    layer: LAYERS.indexOf(u.layer),
    sizeClass: sizeClassOf(u.radius),
    buildTicks: Math.max(1, Math.round(u.buildTime * tr)),
    weapon: u.weapon ? {
      damage: u.weapon.damage,
      range: toFixed(u.weapon.range),
      cooldown: Math.max(1, Math.round(u.weapon.cooldown * tr)),
      speed: tilesPerSecToTick(u.weapon.projectileSpeed, tr),
      splash: toFixed(u.weapon.splash),
      kind: PROJECTILES.indexOf(u.weapon.projectile),
    } : null,
    harvestTicksPerUnit: u.harvest ? Math.max(1, Math.round(tr / u.harvest.rate)) : 0,
    produces: [],
  }));
  const unitById = new Map(units.map((u) => [u.raw.id, u]));
  if (unitById.size !== units.length) throw new Error('Дублирующиеся id юнитов в конфигах');
  for (const u of units) {
    if (!manifest[u.raw.sprite]) throw new Error(`Юнит ${u.raw.id}: спрайт «${u.raw.sprite}» не найден в assets/manifest.json`);
    u.produces = (u.raw.produces ?? []).map((id) => {
      const d = unitById.get(id);
      if (!d) throw new Error(`${u.raw.id}.produces: неизвестный юнит ${id}`);
      return d.index;
    });
  }
  for (const id of Object.keys(game.ai.mix)) if (!unitById.has(id)) throw new Error(`ai.mix: неизвестный юнит ${id}`);
  if (game.defaultSpeedIndex >= game.speedSteps.length) throw new Error('defaultSpeedIndex вне speedSteps');
  return { game, hotkeys, palette, manifest, units, unitById };
}

let cached: Registry | null = null;

/** Реестр из встроенных JSON (Vite и Vitest импортируют их напрямую). */
export function loadRegistry(): Registry {
  cached ??= buildRegistry({
    game: gameJson, hotkeys: hotkeysJson, palette: paletteJson, manifest: manifestJson, units: [...wsUnitsJson],
  });
  return cached;
}
