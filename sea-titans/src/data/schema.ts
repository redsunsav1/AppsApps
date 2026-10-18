import { z } from 'zod';

export const LayerSchema = z.enum(['low', 'mid', 'high']);
export const ProjectileKindSchema = z.enum(['pulse', 'torpedo', 'shell']);

export const WeaponSchema = z.object({
  damage: z.number().positive(),
  range: z.number().positive(),
  cooldown: z.number().positive(),
  projectileSpeed: z.number().positive(),
  splash: z.number().min(0),
  projectile: ProjectileKindSchema,
});

export const UnitDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  role: z.string(),
  kind: z.enum(['unit', 'harvester', 'building']),
  cost: z.number().int().min(0),
  buildTime: z.number().min(0),
  hp: z.number().positive(),
  armor: z.number().min(0),
  speed: z.number().min(0),
  radius: z.number().positive().max(3),
  sight: z.number().positive(),
  layer: LayerSchema,
  sprite: z.string(),
  weapon: WeaponSchema.optional(),
  harvest: z.object({ capacity: z.number().int().positive(), rate: z.number().positive() }).optional(),
  produces: z.array(z.string()).optional(),
});
export type UnitDefRaw = z.infer<typeof UnitDefSchema>;

export const GameConfigSchema = z.object({
  tickRate: z.number().int().positive(),
  speedSteps: z.array(z.number().positive()).min(1),
  defaultSpeedIndex: z.number().int().min(0),
  movement: z.object({
    flowFieldMinGroup: z.number().int().min(1),
    flowFieldsPerTick: z.number().int().min(1),
    formationSpacing: z.number().min(0),
    arriveDistance: z.number().positive(),
    losCheckInterval: z.number().int().positive(),
    flowToDirectDistance: z.number().positive(),
    stuckFinishTicks: z.number().int().positive(),
    stuckFinishDistance: z.number().positive(),
    stuckRepathTicks: z.number().int().positive(),
    stuckGiveUpTicks: z.number().int().positive(),
    separationMargin: z.number().min(0),
    astarMaxNodes: z.number().int().positive(),
  }),
  economy: z.object({
    startMetal: z.number().int().min(0),
    unitCap: z.number().int().positive(),
    queueMax: z.number().int().positive(),
    depositAmount: z.number().int().positive(),
    depositReach: z.number().positive(),
    dropoffReach: z.number().positive(),
    harvesterResumeTicks: z.number().int().positive(),
  }),
  combat: z.object({
    retargetInterval: z.number().int().positive(),
    minDamage: z.number().int().min(0),
    projectileMaxTicks: z.number().int().positive(),
  }),
  ai: z.object({
    thinkInterval: z.number().int().positive(),
    harvesters: z.number().int().min(0),
    waveStart: z.number().int().positive(),
    waveGrow: z.number().int().min(0),
    waveMax: z.number().int().positive(),
    defendRadius: z.number().positive(),
    firstWaveTick: z.number().int().min(0),
    mix: z.record(z.string(), z.number().min(0)),
  }),
  camera: z.object({ scrollSpeed: z.number().positive(), edgeScrollMargin: z.number().min(0), targetWidth: z.number().int().positive() }),
  map: z.object({ width: z.number().int().min(32).max(256), height: z.number().int().min(32).max(256) }),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;

export const HotkeysSchema = z.object({
  camera: z.object({ up: z.array(z.string()), down: z.array(z.string()), left: z.array(z.string()), right: z.array(z.string()) }),
  commands: z.object({ attackMove: z.string(), patrol: z.string(), stop: z.string(), hold: z.string() }),
  build: z.array(z.string()),
  game: z.object({
    pause: z.string(), pauseAlt: z.string(), speedUp: z.string(), speedDown: z.string(),
    debug: z.string(), mute: z.string(), help: z.string(), home: z.string(),
  }),
});
export type Hotkeys = z.infer<typeof HotkeysSchema>;

export type BiomeId = 'sand' | 'silt' | 'coral' | 'rock' | 'volcanic' | 'abyss';

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const PaletteSchema = z.object({
  tile: z.number().int().positive(),
  colors: z.record(z.string(), Hex),
  teams: z.array(z.object({ main: Hex, dark: Hex, name: z.string() })).min(2),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const AssetEntrySchema = z.object({
  source: z.string(),
  size: z.number().int().positive(),
  params: z.record(z.string(), z.number()).optional(),
});
export const AssetManifestSchema = z.record(z.string(), AssetEntrySchema);
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
