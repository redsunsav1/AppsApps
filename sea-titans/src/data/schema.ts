import { z } from 'zod';

export const LayerSchema = z.enum(['low', 'mid', 'high']);
export const ArmorTypeSchema = z.enum(['light', 'medium', 'heavy', 'structure', 'organic', 'titan']);

export const UnitDefSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  role: z.string(),
  tier: z.number().int().min(1).max(4),
  hp: z.number().positive(),
  armor: z.number().min(0),
  armorType: ArmorTypeSchema,
  speed: z.number().positive(),
  turnRate: z.number().positive(),
  radius: z.number().positive().max(3),
  sight: z.number().positive(),
  layer: LayerSchema,
  sprite: z.string(),
});
export type UnitDefRaw = z.infer<typeof UnitDefSchema>;

export const MovementConfigSchema = z.object({
  flowFieldMinGroup: z.number().int().min(1),
  flowFieldsPerTick: z.number().int().min(1),
  formationSpacing: z.number().min(0),
  arriveDistance: z.number().positive(),
  slowRadius: z.number().positive(),
  accelerationTicks: z.number().int().positive(),
  losCheckInterval: z.number().int().positive(),
  flowToDirectDistance: z.number().positive(),
  stuckFinishTicks: z.number().int().positive(),
  stuckFinishDistance: z.number().positive(),
  stuckRepathTicks: z.number().int().positive(),
  stuckGiveUpTicks: z.number().int().positive(),
  separationMargin: z.number().min(0),
  turnSlowdownMin: z.number().min(0).max(1),
  astarMaxNodes: z.number().int().positive(),
});

export const GameConfigSchema = z.object({
  tickRate: z.number().int().positive(),
  speedSteps: z.array(z.number().positive()).min(1),
  defaultSpeedIndex: z.number().int().min(0),
  movement: MovementConfigSchema,
  camera: z.object({
    scrollSpeed: z.number().positive(),
    edgeScrollSpeed: z.number().positive(),
    edgeScrollMargin: z.number().min(0),
    zoomMin: z.number().positive(),
    zoomMax: z.number().positive(),
    zoomStep: z.number().gt(1),
  }),
  testMap: z.object({ width: z.number().int().min(16).max(512), height: z.number().int().min(16).max(512), seed: z.number().int() }),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;

export const HotkeysSchema = z.object({
  camera: z.object({ up: z.array(z.string()), down: z.array(z.string()), left: z.array(z.string()), right: z.array(z.string()) }),
  commands: z.object({ attackMove: z.string(), patrol: z.string(), stop: z.string(), hold: z.string() }),
  game: z.object({
    pause: z.string(), pauseAlt: z.string(), speedUp: z.string(), speedDown: z.string(), debug: z.string(), debugPaths: z.string(),
  }),
});
export type Hotkeys = z.infer<typeof HotkeysSchema>;

export const BiomeIdSchema = z.enum(['sand', 'silt', 'coral', 'rock', 'volcanic', 'abyss']);
export type BiomeId = z.infer<typeof BiomeIdSchema>;

export const RenderConfigSchema = z.object({
  tileWidth: z.number().int().positive(),
  tileHeight: z.number().int().positive(),
  heightPixels: z.number().min(0),
  layerHeightPixels: z.record(LayerSchema, z.number()),
  biomes: z.record(BiomeIdSchema, z.object({ color: z.string().regex(/^#[0-9a-f]{6}$/i), caustics: z.number().min(0) })),
  teamColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).min(2),
});
export type RenderConfig = z.infer<typeof RenderConfigSchema>;

export const AssetEntrySchema = z.object({
  source: z.string(),
  params: z.record(z.string(), z.number()).optional(),
  atlas: z.string().optional(),
  directions: z.union([z.literal(8), z.literal(16)]),
  anchor: z.tuple([z.number(), z.number()]),
  teamMask: z.boolean(),
});
export const AssetManifestSchema = z.record(z.string(), AssetEntrySchema);
export type AssetManifest = z.infer<typeof AssetManifestSchema>;
export type AssetEntry = z.infer<typeof AssetEntrySchema>;
