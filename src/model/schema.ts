import { z } from 'zod';

// Schemas double as the source of truth for types and as runtime validation
// for the hand-edited JSON in src/data and for imported save files.

export const SLOT_TYPES = ['core', 'inner', 'outer'] as const;
export const slotTypeSchema = z.enum(SLOT_TYPES);

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

export const buildingDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  icon: z.string(),
  sprite: z.string(),
  allowedSlots: z.array(slotTypeSchema).min(1),
  levels: z.array(buildingLevelSchema).min(1),
  requires: z.array(requirementSchema).optional(),
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

const normalized = z.number().min(0).max(1);

export const slotDefSchema = z.object({
  id: z.string().min(1),
  type: slotTypeSchema,
  x: normalized,
  y: normalized,
});

export const slotsFileSchema = z.object({
  /** Sprite size per slot type, as a fraction of the map width. */
  sizes: z.record(slotTypeSchema, normalized),
  slots: z.array(slotDefSchema).min(1),
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

export const worldSchema = z.object({
  id: z.string().min(1),
  name: displayName,
  color: hexColor,
  icon: imageRef,
  description: z.string().optional(),
  influence: percent,
});

export const materialsSchema = z.object({
  categories: z.array(categorySchema),
  items: z.array(materialSchema),
});

export const researchBookSchema = z.object({
  categories: z.array(categorySchema),
  entries: z.array(researchSchema),
});

export const influenceSchema = z.object({
  /** Overall standing of the group; not derived from the worlds. */
  total: percent,
  worlds: z.array(worldSchema),
});

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
    /** Absent for the overall influence. */
    world: z.string().optional(),
    from: percent,
    to: percent,
  }),
  z.object({
    day: positiveInt,
    kind: z.enum(['world_added', 'world_removed', 'character_added', 'character_removed']),
    name: z.string(),
  }),
]);

export const SAVE_VERSION = 2;

export const gameStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
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

export type SlotType = z.infer<typeof slotTypeSchema>;
export type AmountBag = Readonly<z.infer<typeof amountBagSchema>>;
export type Cost = z.infer<typeof costSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type BuildingLevel = z.infer<typeof buildingLevelSchema>;
export type BuildingDef = z.infer<typeof buildingDefSchema>;
export type CurrencyDef = z.infer<typeof currencyDefSchema>;
export type SlotDef = z.infer<typeof slotDefSchema>;
export type SlotsFile = z.infer<typeof slotsFileSchema>;
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
