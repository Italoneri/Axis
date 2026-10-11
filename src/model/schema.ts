import { z } from 'zod';
import { slotTypeSchema } from '../map/layout';

// Schemas double as the source of truth for types and as runtime validation
// for the hand-edited JSON in src/data and for imported save files.

const positiveInt = z.number().int().nonnegative();
const percent = z.number().int().min(0).max(100);
const displayName = z.string().trim().min(1);
/** Asset key from assets.json or an image URL; empty means "draw a placeholder". */
const imageRef = z.string().optional();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Amount per id (coins per currency, units per material). */
export const amountBagSchema = z.record(z.string(), positiveInt);

export const requirementSchema = z.object({
  building: z.string(),
  minLevel: z.number().int().positive(),
});

/** `coins` is a value in gold (PO); materials reference ids in the materials catalog. */
export const costSchema = z.object({
  coins: z.number().nonnegative(),
  materials: amountBagSchema.optional(),
});

export const buildingLevelSchema = z.object({
  cost: costSchema,
  buildTime: positiveInt,
  effect: z.string().min(1),
  requires: z.array(requirementSchema).optional(),
});

/** Art coordinates: 0–1 across the building image, origin at its top-left corner. */
const artCoordinate = z.number().min(0).max(1);
const fxBase = {
  x: artCoordinate,
  y: artCoordinate,
  /** The effect only shows from this level on. */
  minLevel: z.number().int().positive().optional(),
  /** ...and up to this level (for details later art replaces). */
  maxLevel: z.number().int().positive().optional(),
};

/** Animated effects drawn over finished building art (never baked into the PNG). */
export const buildingFxSchema = z.discriminatedUnion('type', [
  /** `color` tints the puffs (default: warm grey). */
  z.object({ ...fxBase, type: z.literal('smoke'), color: hexColor.optional() }),
  z.object({
    ...fxBase,
    type: z.literal('glow'),
    color: hexColor,
    /** Share of the art width. */
    radius: artCoordinate,
  }),
  /** `color` sets the spark hue; lighter shades of it are mixed in (default: forge orange). */
  z.object({ ...fxBase, type: z.literal('sparks'), color: hexColor.optional() }),
]);

export const buildingDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  sprite: z.string(),
  allowedSlots: z.array(slotTypeSchema).min(1),
  levels: z.array(buildingLevelSchema).min(1),
  requires: z.array(requirementSchema).optional(),
  fx: z.array(buildingFxSchema).optional(),
});

export const currencyDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  /** Worth of one coin in the smallest unit (bronze). All coin math is done in bronze integers. */
  bronzeValue: z.number().int().positive(),
  /** Display order: 1 is shown first (the most valuable coin). */
  order: z.number().int(),
});

export const assetManifestSchema = z.object({
  images: z.record(z.string(), z.string()),
});

// ---------- Dynamic records: seeded from src/data, then edited by the master in game ----------

export const categorySchema = z.object({ id: z.string().min(1), name: displayName });

export const characterSchema = z.object({
  id: z.string().min(1),
  name: displayName,
  color: hexColor,
  portrait: imageRef,
});

export const materialSchema = z.object({
  id: z.string().min(1),
  name: displayName,
  category: z.string(),
  icon: imageRef,
  description: z.string().optional(),
  quantity: positiveInt,
});

const researchBase = {
  id: z.string().min(1),
  title: displayName,
  category: z.string(),
  startedOnDay: positiveInt.optional(),
  /** Free text: usually a character name, but NPCs and groups are allowed. */
  owner: z.string().optional(),
  description: z.string(),
  notes: z.string(),
  /** Informational only: never charged automatically. */
  cost: costSchema.optional(),
};

export const researchSchema = z.discriminatedUnion('status', [
  z.object({ ...researchBase, status: z.literal('em_andamento'), progress: percent }),
  z.object({
    ...researchBase,
    status: z.literal('concluida'),
    completedOnDay: positiveInt.optional(),
  }),
]);

/** One of the fixed worlds of influence.json; only its percent lives in the save. */
export const worldSchema = z.object({
  id: z.string().min(1),
  name: displayName,
  color: hexColor,
  icon: imageRef,
  description: z.string().optional(),
});

export const materialsSchema = z.object({
  categories: z.array(categorySchema),
  items: z.array(materialSchema),
});

export const researchBookSchema = z.object({
  categories: z.array(categorySchema),
  entries: z.array(researchSchema),
});

/** influence.json: the fixed list of worlds, in display order. */
export const worldsFileSchema = z.object({ worlds: z.array(worldSchema).min(1) });

/** Percent per world id. The overall influence is their average, never stored. */
export const influenceSchema = z.record(z.string(), percent);

export const walletsSeedSchema = z.object({
  camp: amountBagSchema,
  characters: z.array(characterSchema.extend({ wallet: amountBagSchema })),
});

// ---------- Saved game ----------

const placedBuildingSchema = z.discriminatedUnion('status', [
  z.object({
    buildingId: z.string(),
    level: z.number().int().positive(),
    status: z.literal('building'),
    startedOnDay: positiveInt,
    completesOnDay: positiveInt,
  }),
  z.object({
    buildingId: z.string(),
    level: z.number().int().positive(),
    status: z.literal('done'),
  }),
]);

/** What a construction charged: coins in bronze, materials by display name at the time. */
const paidSchema = z.object({ bronze: positiveInt, materials: amountBagSchema });

const buildingEventSchema = z.object({
  day: positiveInt,
  kind: z.enum([
    'build_started',
    'upgrade_started',
    'build_completed',
    'building_forced',
    'building_removed',
    /** Dropped while loading a save: its slot no longer exists in the layout. */
    'building_dropped',
  ]),
  buildingId: z.string(),
  level: z.number().int().positive(),
  actor: z.string().optional(),
  paid: paidSchema.optional(),
});

const signedBag = z.record(z.string(), z.number().int());
/** Character name; absent means the Acampamento. */
const walletLabel = z.string().optional();

// Log entries keep display names (not ids) for things the master can rename or delete,
// so old entries stay readable after the record is gone.
export const logEntrySchema = z.discriminatedUnion('kind', [
  buildingEventSchema,
  z.object({
    day: positiveInt,
    kind: z.literal('days_advanced'),
    days: z.number().int().positive(),
  }),
  z.object({
    day: positiveInt,
    kind: z.literal('coins_adjusted'),
    wallet: walletLabel,
    delta: signedBag,
  }),
  z.object({
    day: positiveInt,
    kind: z.literal('coins_deposited'),
    character: z.string(),
    coins: amountBagSchema,
  }),
  z.object({
    day: positiveInt,
    kind: z.literal('coins_transferred'),
    from: walletLabel,
    to: walletLabel,
    coins: amountBagSchema,
  }),
  z.object({ day: positiveInt, kind: z.literal('coins_consolidated'), wallet: walletLabel }),
  z.object({
    day: positiveInt,
    kind: z.literal('material_adjusted'),
    material: z.string(),
    delta: z.number().int(),
  }),
  z.object({
    day: positiveInt,
    kind: z.enum(['material_added', 'material_removed']),
    material: z.string(),
  }),
  z.object({
    day: positiveInt,
    kind: z.enum(['research_added', 'research_completed', 'research_removed']),
    title: z.string(),
  }),
  z.object({
    day: positiveInt,
    kind: z.literal('research_progressed'),
    title: z.string(),
    from: percent,
    to: percent,
  }),
  z.object({
    day: positiveInt,
    kind: z.literal('influence_changed'),
    world: z.string(),
    from: percent,
    to: percent,
    /** Overall influence (the average of all worlds) right after the change. */
    total: z.number().min(0).max(100),
  }),
  z.object({
    day: positiveInt,
    kind: z.enum(['character_added', 'character_removed']),
    name: z.string(),
  }),
]);

export const SAVE_VERSION = 4;

export const gameStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
  /**
   * Bumped by every accepted change; a save only goes through when the stored
   * revision is the one it started from. Saves from before it start at 0.
   */
  revision: positiveInt.default(0),
  day: positiveInt,
  characters: z.array(characterSchema),
  wallets: z.object({
    /** The Acampamento: the only wallet that pays for structures. */
    camp: amountBagSchema,
    characters: z.record(z.string(), amountBagSchema),
  }),
  materials: materialsSchema,
  research: researchBookSchema,
  influence: influenceSchema,
  slots: z.record(z.string(), placedBuildingSchema),
  log: z.array(logEntrySchema),
});

export type AmountBag = Readonly<z.infer<typeof amountBagSchema>>;
export type Cost = z.infer<typeof costSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type BuildingLevel = z.infer<typeof buildingLevelSchema>;
export type BuildingFx = z.infer<typeof buildingFxSchema>;
export type BuildingDef = z.infer<typeof buildingDefSchema>;
export type CurrencyDef = z.infer<typeof currencyDefSchema>;
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Character = z.infer<typeof characterSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Research = z.infer<typeof researchSchema>;
export type ResearchStatus = Research['status'];
export type World = z.infer<typeof worldSchema>;
export type Materials = z.infer<typeof materialsSchema>;
export type ResearchBook = z.infer<typeof researchBookSchema>;
export type Influence = z.infer<typeof influenceSchema>;
export type WalletsSeed = z.infer<typeof walletsSeedSchema>;
export type PlacedBuilding = z.infer<typeof placedBuildingSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type GameState = z.infer<typeof gameStateSchema>;
