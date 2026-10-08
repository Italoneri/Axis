import { z } from 'zod';

// Schemas double as the source of truth for types and as runtime validation
// for the hand-edited JSON in src/data and for imported save files.

export const SLOT_TYPES = ['core', 'inner', 'outer'] as const;
export const slotTypeSchema = z.enum(SLOT_TYPES);

const positiveInt = z.number().int().nonnegative();

export const resourceBagSchema = z.record(z.string(), positiveInt);

export const requirementSchema = z.object({
  building: z.string(),
  minLevel: z.number().int().positive(),
});

export const buildingLevelSchema = z.object({
  cost: resourceBagSchema,
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

export const resourceDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string(),
  initial: positiveInt,
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

export const logEntrySchema = z.object({
  day: positiveInt,
  kind: z.enum(['build_started', 'upgrade_started', 'build_completed']),
  buildingId: z.string(),
  level: z.number().int().positive(),
  actor: z.string().optional(),
});

export const SAVE_VERSION = 1;

export const gameStateSchema = z.object({
  version: z.literal(SAVE_VERSION),
  day: positiveInt,
  resources: resourceBagSchema,
  slots: z.record(z.string(), placedBuildingSchema),
  log: z.array(logEntrySchema),
});

export type SlotType = z.infer<typeof slotTypeSchema>;
export type ResourceBag = Readonly<z.infer<typeof resourceBagSchema>>;
export type Requirement = z.infer<typeof requirementSchema>;
export type BuildingLevel = z.infer<typeof buildingLevelSchema>;
export type BuildingDef = z.infer<typeof buildingDefSchema>;
export type ResourceDef = z.infer<typeof resourceDefSchema>;
export type SlotDef = z.infer<typeof slotDefSchema>;
export type SlotsFile = z.infer<typeof slotsFileSchema>;
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type PlacedBuilding = z.infer<typeof placedBuildingSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type GameState = z.infer<typeof gameStateSchema>;
