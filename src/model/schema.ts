import { z } from 'zod';
import { slotTypeSchema } from '../map/layout';

// Schemas double as the source of truth for types and as runtime validation
// for the hand-edited JSON in src/data and for imported save files.

const positiveInt = z.number().int().nonnegative();
const percent = z.number().int().min(0).max(100);
const displayName = z.string().trim().min(1);
/**
 * Asset key from assets.json, an image URL, or a photo sent in game
 * (`upload:…`, see src/systems/GameImages.ts); empty means "draw a placeholder".
 */
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

/** Skill score of an NPC: 0 still works, at the base rate. */
/** Negative levels hinder the post: the NPC works against it. */
export const skillLevelSchema = z.number().int().min(-10).max(10);

export const skillDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Shown as text (an emoji), next to the name. */
  icon: z.string(),
  description: z.string(),
});

/** Base amount per day; the worker's skill scales it (see `yieldTenths`). */
const perDay = z.number().positive();

export const jobEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('produce'), material: z.string().min(1), perDay }),
  /** Percent points added to the research the NPC was assigned to. */
  z.object({ type: z.literal('research'), perDay }),
  /** Days taken off the construction the NPC works on. */
  z.object({ type: z.literal('construction'), perDay }),
  /** Shown among the active bonuses while the post is filled; `penalty` replaces it when a worker hinders. */
  z.object({
    type: z.literal('bonus'),
    text: z.string().min(1),
    penalty: z.string().min(1).optional(),
  }),
]);

/**
 * A work post. How many NPCs fill it at once comes from the slot it stands on
 * (`postSlots` in npcs.json), so `slots` is refused here.
 */
export const jobDefSchema = z.strictObject({
  activity: z.string().min(1),
  name: z.string().min(1),
  skill: z.string().min(1),
  effect: jobEffectSchema,
});

export const buildingLevelSchema = z.object({
  cost: costSchema,
  buildTime: positiveInt,
  effect: z.string().min(1),
  requires: z.array(requirementSchema).optional(),
  housing: z.object({ capacity: z.number().int().positive() }).optional(),
  jobs: z.array(jobDefSchema).optional(),
});

/** npcs.json: the negative skill divisor and the post every construction in progress offers. */
export const npcsConfigSchema = z.object({
  /** A negative skill yields `base × skill / negativeDivisor`. */
  negativeDivisor: z.number().positive(),
  /** The only buildings whose levels may offer `housing`. */
  housingBuildings: z.array(z.string().min(1)).min(1),
  /** Openings of every building post by slot type, per level in force (index 0 = level 1). */
  postSlots: z.partialRecord(
    z.enum(['core', 'middle', 'outer']),
    z.array(z.number().int().positive()).min(1),
  ),
  /** Its openings stay the same on any slot. */
  construction: jobDefSchema.extend({
    slots: z.number().int().positive(),
    effect: jobEffectSchema.options[2],
  }),
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

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const;
export const mealSchema = z.enum(MEALS);

/** One dish of the tavern menu (tavern_menu.json); read only, it changes with a deploy. */
export const menuItemSchema = z.object({
  id: z.string().min(1),
  meal: mealSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  /** Key in assets.json. */
  image: z.string().min(1),
  /** Coins, e.g. { "bronze": 3 }. */
  price: amountBagSchema.optional(),
  effect: z.string().min(1).optional(),
  /** Tavern level the dish needs; 1 when unset. */
  minLevel: z.number().int().min(1).optional(),
});

export const tavernMenuSchema = z.object({ items: z.array(menuItemSchema) });

/** missions.json: how a mission reward is shared out. */
export const missionsConfigSchema = z.object({
  /** Share of a reward the Acampamento keeps when NPCs do the mission; the rest goes to them. */
  campCommissionPercent: percent,
  /** Rewards pay `percent` more while `building` is in force at `minLevel` or above. */
  guildBonus: z.object({
    building: z.string().min(1),
    minLevel: z.number().int().positive(),
    percent: z.number().int().min(0).max(1000),
  }),
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

export const npcStatusSchema = z.enum(['disponivel', 'trabalhando', 'ferido', 'em_missao']);

/** One filled post. `carry` holds the tenths of yield not delivered yet (0–9). */
export const npcJobSchema = z.object({
  slotId: z.string().min(1),
  activityId: z.string().min(1),
  /** Target of a research post. */
  researchId: z.string().min(1).optional(),
  /** Leftover tenths, signed like the yield. */
  carry: z.number().int().min(-9).max(9),
});

export const npcSchema = z.object({
  id: z.string().min(1),
  name: displayName,
  /** Role shown under the name, such as "Maga". */
  title: z.string(),
  portrait: imageRef,
  description: z.string(),
  /** Score per skill id; a missing skill counts as 0. */
  skills: z.record(z.string(), skillLevelSchema),
  /** Slot of the building the NPC lives in. */
  home: z.string().nullable(),
  job: npcJobSchema.nullable(),
  /** `disponivel`/`trabalhando` follow the job; `ferido`/`em_missao` are set by the master. */
  status: npcStatusSchema,
  /** Gold (PO) paid by the Acampamento for each day of work. */
  wage: z.number().nonnegative().optional(),
  /** Bronze earned in missions so far; NPCs have no wallet. */
  earnings: positiveInt.optional(),
});

export const MISSION_TITLE_LIMIT = 120;
export const MISSION_DESCRIPTION_LIMIT = 4000;
export const MISSION_MAX_DAYS = 365;

export const missionDifficultySchema = z.enum(['facil', 'media', 'dificil']);
export const missionResultSchema = z.enum(['sucesso', 'falha']);

const npcTeam = {
  npcIds: z.array(z.string().min(1)).min(1),
  startedOnDay: positiveInt,
  returnsOnDay: positiveInt,
};

/** Where a mission stands: open, out with the group or the NPCs, back, or resolved. */
export const missionProgressSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('aberta') }),
  z.object({ status: z.literal('grupo'), startedOnDay: positiveInt }),
  z.object({ status: z.literal('npcs'), ...npcTeam }),
  /** The NPCs came back: the master decides how it went. */
  z.object({ status: z.literal('aguardando'), ...npcTeam }),
  z.object({
    status: z.literal('concluida'),
    by: z.enum(['grupo', 'npcs']),
    result: missionResultSchema,
    resolvedOnDay: positiveInt,
    /** What each side was paid, in bronze. */
    campBronze: positiveInt,
    npcBronze: positiveInt,
    /** Names at the time, so the record stays readable after an NPC is gone. */
    npcs: z.array(z.string()),
    injured: z.array(z.string()),
  }),
]);

/** A contract pinned to the Guilda board (see docs/plans/MISSOES.md). */
export const missionSchema = z.object({
  id: z.string().min(1),
  title: displayName.max(MISSION_TITLE_LIMIT),
  requester: z.string(),
  location: z.string(),
  /** Same markdown as the Arquivo de registros. */
  description: z.string().max(MISSION_DESCRIPTION_LIMIT),
  /** Coins as typed; paid out in bronze math. */
  reward: amountBagSchema,
  /** Expected length in game days. */
  days: z.number().int().min(1).max(MISSION_MAX_DAYS),
  difficulty: missionDifficultySchema,
  /** Character name or "Mestre"; absent for an anonymous player. */
  createdBy: z.string().optional(),
  createdOnDay: positiveInt,
  progress: missionProgressSchema,
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

/**
 * Fields every log entry shares. `actor` is who ran the command: a character
 * name or "Mestre"; absent for entries from before it was recorded.
 */
const entryBase = { day: positiveInt, actor: z.string().optional() };

const buildingEventSchema = z.object({
  ...entryBase,
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
  paid: paidSchema.optional(),
});

const signedBag = z.record(z.string(), z.number().int());
/** Why an NPC lost a home or a post without a command asking for it. */
export const npcReleaseReasonSchema = z.enum([
  'building_removed',
  'capacity',
  'construction_done',
  'research_closed',
  'no_home',
]);
/** Character name; absent means the Acampamento. */
const walletLabel = z.string().optional();

/**
 * What changed in the Arquivo de registros (kept outside the state, see
 * docs/plans/ARQUIVO.md). Names at the time, like every other entry.
 */
export const archiveChangeSchema = z.union([
  z.object({
    target: z.enum(['topic', 'note']),
    action: z.enum(['created', 'edited', 'reordered', 'removed', 'restored']),
    title: z.string(),
  }),
  z.object({
    target: z.literal('note'),
    action: z.literal('moved'),
    title: z.string(),
    from: z.string(),
    to: z.string(),
  }),
  /** `title` is the topic the records were pasted into. */
  z.object({
    target: z.literal('notes'),
    action: z.literal('pasted'),
    title: z.string(),
    count: z.number().int().positive(),
  }),
  z.object({ target: z.literal('trash'), action: z.literal('emptied') }),
  /** `title` is the note the images were attached to. */
  z.object({
    target: z.literal('images'),
    action: z.literal('attached'),
    title: z.string(),
    count: z.number().int().positive(),
  }),
  z.object({ target: z.literal('image'), action: z.literal('removed'), title: z.string() }),
]);

// Log entries keep display names (not ids) for things the master can rename or delete,
// so old entries stay readable after the record is gone.
export const logEntrySchema = z.discriminatedUnion('kind', [
  buildingEventSchema,
  z.object({
    ...entryBase,
    kind: z.literal('days_advanced'),
    days: z.number().int().positive(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('coins_adjusted'),
    wallet: walletLabel,
    delta: signedBag,
  }),
  z.object({
    ...entryBase,
    kind: z.literal('coins_deposited'),
    character: z.string(),
    coins: amountBagSchema,
  }),
  z.object({
    ...entryBase,
    kind: z.literal('coins_transferred'),
    from: walletLabel,
    to: walletLabel,
    coins: amountBagSchema,
  }),
  z.object({ ...entryBase, kind: z.literal('coins_consolidated'), wallet: walletLabel }),
  z.object({
    ...entryBase,
    kind: z.literal('material_adjusted'),
    material: z.string(),
    delta: z.number().int(),
  }),
  z.object({
    ...entryBase,
    kind: z.enum(['material_added', 'material_removed']),
    material: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.enum(['research_added', 'research_completed', 'research_removed']),
    title: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('research_progressed'),
    title: z.string(),
    from: percent,
    to: percent,
  }),
  z.object({
    ...entryBase,
    kind: z.literal('influence_changed'),
    world: z.string(),
    from: percent,
    to: percent,
    /** Overall influence (the average of all worlds) right after the change. */
    total: z.number().min(0).max(100),
  }),
  z.object({
    ...entryBase,
    kind: z.enum(['character_added', 'character_removed']),
    name: z.string(),
  }),
  z.object({ ...entryBase, kind: z.literal('research_ready'), title: z.string() }),
  // NPCs: `place` is a building id (fixed catalog data), `npc` the name at the time.
  z.object({
    ...entryBase,
    kind: z.enum(['npc_added', 'npc_updated', 'npc_removed', 'npc_unassigned']),
    npc: z.string(),
  }),
  /** No `place`: the NPC moved out. */
  z.object({
    ...entryBase,
    kind: z.literal('npc_home_set'),
    npc: z.string(),
    place: z.string().optional(),
  }),
  /** Moved by the game, not by a player: its old home stopped housing NPCs. */
  z.object({
    ...entryBase,
    kind: z.literal('npc_moved'),
    npc: z.string(),
    from: z.string(),
    place: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('npc_job_set'),
    npc: z.string(),
    place: z.string(),
    activity: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('npc_released'),
    npc: z.string(),
    from: z.enum(['home', 'job']),
    reason: npcReleaseReasonSchema,
  }),
  /** Summary of one advance: what the NPC delivered, in whole units. */
  z.object({
    ...entryBase,
    kind: z.literal('npc_worked'),
    npc: z.string(),
    effect: z.enum(['produce', 'research', 'construction']),
    /** Negative when the NPC hindered: material spoiled, research lost, days of delay. */
    amount: z
      .number()
      .int()
      .refine((n) => n !== 0),
    /** Material name, research title or building id. */
    target: z.string(),
  }),
  z.object({ ...entryBase, kind: z.literal('npc_wages_paid'), bronze: positiveInt }),
  z.object({
    ...entryBase,
    kind: z.literal('npc_unpaid'),
    npc: z.string(),
    days: z.number().int().positive(),
  }),
  z.object({ ...entryBase, kind: z.literal('archive_changed'), change: archiveChangeSchema }),
  // Missions: titles and names at the time.
  z.object({
    ...entryBase,
    kind: z.enum([
      'mission_created',
      'mission_updated',
      'mission_removed',
      'mission_taken',
      'mission_returned',
      /** Every NPC sent was removed: the mission is open again. */
      'mission_reopened',
    ]),
    title: z.string(),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('mission_npcs_sent'),
    title: z.string(),
    npcs: z.array(z.string()),
  }),
  z.object({
    ...entryBase,
    kind: z.literal('mission_resolved'),
    title: z.string(),
    by: z.enum(['grupo', 'npcs']),
    result: missionResultSchema,
    campBronze: positiveInt,
    npcBronze: positiveInt,
    injured: z.array(z.string()),
  }),
]);

export const SAVE_VERSION = 7;

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
  /** Photos the master gave the fixed worlds, by world id (influence.json has no in-game edit). */
  worldIcons: z.record(z.string(), z.string()).optional(),
  npcs: z.array(npcSchema),
  missions: z.array(missionSchema),
  slots: z.record(z.string(), placedBuildingSchema),
  log: z.array(logEntrySchema),
});

export type AmountBag = Readonly<z.infer<typeof amountBagSchema>>;
export type Cost = z.infer<typeof costSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type BuildingLevel = z.infer<typeof buildingLevelSchema>;
export type SkillDef = z.infer<typeof skillDefSchema>;
export type JobEffect = z.infer<typeof jobEffectSchema>;
export type JobDef = z.infer<typeof jobDefSchema>;
export type NpcsConfig = z.infer<typeof npcsConfigSchema>;
export type BuildingFx = z.infer<typeof buildingFxSchema>;
export type BuildingDef = z.infer<typeof buildingDefSchema>;
export type CurrencyDef = z.infer<typeof currencyDefSchema>;
export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;
export type TavernMenu = z.infer<typeof tavernMenuSchema>;
export type MissionsConfig = z.infer<typeof missionsConfigSchema>;
export type MissionDifficulty = z.infer<typeof missionDifficultySchema>;
export type MissionResult = z.infer<typeof missionResultSchema>;
export type MissionProgress = z.infer<typeof missionProgressSchema>;
export type MissionStatus = MissionProgress['status'];
export type Mission = z.infer<typeof missionSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Character = z.infer<typeof characterSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Research = z.infer<typeof researchSchema>;
export type ResearchStatus = Research['status'];
export type World = z.infer<typeof worldSchema>;
export type Materials = z.infer<typeof materialsSchema>;
export type ResearchBook = z.infer<typeof researchBookSchema>;
export type Influence = z.infer<typeof influenceSchema>;
export type NpcStatus = z.infer<typeof npcStatusSchema>;
export type NpcJob = z.infer<typeof npcJobSchema>;
export type Npc = z.infer<typeof npcSchema>;
export type NpcReleaseReason = z.infer<typeof npcReleaseReasonSchema>;
export type WalletsSeed = z.infer<typeof walletsSeedSchema>;
export type PlacedBuilding = z.infer<typeof placedBuildingSchema>;
export type ArchiveChange = z.infer<typeof archiveChangeSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type GameState = z.infer<typeof gameStateSchema>;
