import { z } from 'zod';
import { angleRangesOverlap } from '../map/geometry';
import { layoutSchema, type MapLayout, type SlotDef } from '../map/layout';
import {
  assetManifestSchema,
  buildingDefSchema,
  currencyDefSchema,
  materialsSchema,
  missionsConfigSchema,
  npcsConfigSchema,
  researchBookSchema,
  skillDefSchema,
  tavernMenuSchema,
  walletsSeedSchema,
  worldsFileSchema,
  type AssetManifest,
  type BuildingDef,
  type CurrencyDef,
  type JobDef,
  type Materials,
  type MissionsConfig,
  type NpcsConfig,
  type ResearchBook,
  type SkillDef,
  type TavernMenu,
  type WalletsSeed,
  type World,
} from './schema';

/** The currency whose value is used to write costs ("coins": 150 means 150 of these). */
export const GOLD_CURRENCY_ID = 'gold';

/** Starting values for the records the master edits in game; they live in GameState afterwards. */
export interface Seed {
  readonly wallets: WalletsSeed;
  readonly materials: Materials;
  readonly research: ResearchBook;
}

/** All static game data, validated and cross-checked. */
export interface Catalog {
  /** Sorted by display order: the most valuable coin first. */
  readonly currencies: readonly CurrencyDef[];
  readonly buildings: readonly BuildingDef[];
  readonly layout: MapLayout;
  /** The fixed worlds of influence, in display order; the master only edits their percent. */
  readonly worlds: readonly World[];
  readonly assets: AssetManifest;
  readonly seed: Seed;
  /** NPC skills, in display order. */
  readonly skills: readonly SkillDef[];
  readonly npcs: NpcsConfig;
  /** How mission rewards are shared out. */
  readonly missions: MissionsConfig;
  /** Dishes the tavern serves; empty where the menu is not shipped (the Edge Function). */
  readonly tavernMenu: TavernMenu;
}

/** The building whose panel opens the menu, and whose level unlocks dishes. */
export const TAVERN_BUILDING_ID = 'tavern';

export interface RawCatalog {
  currencies: unknown;
  buildings: unknown;
  layout: unknown;
  assets: unknown;
  wallets: unknown;
  materials: unknown;
  research: unknown;
  influence: unknown;
  skills: unknown;
  npcs: unknown;
  missions: unknown;
  /** Display only, so the server catalog leaves it out. */
  tavernMenu?: unknown;
}

/**
 * Validates the JSON data files. Throws listing every problem at once, so a
 * typo in buildings.json is reported clearly instead of breaking at runtime.
 */
export function parseCatalog(raw: RawCatalog): Catalog {
  const currencies = parseFile('currencies.json', z.array(currencyDefSchema), raw.currencies);
  const catalog: Catalog = {
    currencies: [...currencies].sort((a, b) => a.order - b.order),
    buildings: parseFile('buildings.json', z.array(buildingDefSchema), raw.buildings),
    layout: parseFile('layout.json', layoutSchema, raw.layout),
    worlds: parseFile('influence.json', worldsFileSchema, raw.influence).worlds,
    assets: parseFile('assets.json', assetManifestSchema, raw.assets),
    seed: {
      wallets: parseFile('wallets.json', walletsSeedSchema, raw.wallets),
      materials: parseFile('materials.json', materialsSchema, raw.materials),
      research: parseFile('research.json', researchBookSchema, raw.research),
    },
    skills: parseFile('skills.json', z.object({ skills: z.array(skillDefSchema) }), raw.skills)
      .skills,
    npcs: parseFile('npcs.json', npcsConfigSchema, raw.npcs),
    missions: parseFile('missions.json', missionsConfigSchema, raw.missions),
    tavernMenu: parseFile('tavern_menu.json', tavernMenuSchema, raw.tavernMenu ?? { items: [] }),
  };
  const problems = findReferenceProblems(catalog);
  if (problems.length > 0) {
    throw new Error(`Invalid game data:\n- ${problems.join('\n- ')}`);
  }
  return catalog;
}

export function findBuilding(catalog: Catalog, id: string): BuildingDef | undefined {
  return catalog.buildings.find((b) => b.id === id);
}

export function findSlot(catalog: Catalog, id: string): SlotDef | undefined {
  return catalog.layout.slots.find((s) => s.id === id);
}

/** Bronze worth of one gold coin, the unit costs are written in. */
export function goldInBronze(catalog: Catalog): number {
  return catalog.currencies.find((c) => c.id === GOLD_CURRENCY_ID)?.bronzeValue ?? 1;
}

/**
 * Resolves an image reference: an asset key from assets.json, or a URL typed by
 * the master. Anything else yields undefined so the UI draws a placeholder.
 */
export function resolveImage(catalog: Catalog, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  const asset = catalog.assets.images[ref];
  if (asset) return asset;
  return /^(https?:\/\/|data:image\/|\/|assets\/)/.test(ref) ? ref : undefined;
}

function parseFile<T>(fileName: string, schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`Invalid ${fileName}:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function findReferenceProblems(catalog: Catalog): string[] {
  const buildingIds = new Set(catalog.buildings.map((b) => b.id));
  const assetKeys = new Set(Object.keys(catalog.assets.images));

  const missingAsset = (owner: string, key: string) =>
    assetKeys.has(key) ? [] : [`${owner}: asset "${key}" is not in assets.json`];

  // Material ids in costs are not checked here: the master can add and remove
  // materials in game, so an unknown one is reported as unavailable at build time.
  const buildingProblems = catalog.buildings.flatMap((b) => {
    const requirements = [...(b.requires ?? []), ...b.levels.flatMap((l) => l.requires ?? [])];
    return [
      ...missingAsset(b.id, b.icon),
      ...missingAsset(b.id, b.sprite),
      ...requirements
        .filter((r) => !buildingIds.has(r.building))
        .map((r) => `${b.id}: requires unknown building "${r.building}"`),
    ];
  });

  return [
    ...duplicates('building', catalog.buildings),
    ...duplicates('currency', catalog.currencies),
    ...duplicates('slot', catalog.layout.slots),
    ...duplicates('world', catalog.worlds),
    ...duplicates('skill', catalog.skills),
    ...jobProblems(catalog),
    ...housingProblems(catalog),
    ...postSlotProblems(catalog),
    ...layoutProblems(catalog),
    ...currencyProblems(catalog.currencies),
    ...catalog.currencies.flatMap((c) => missingAsset(c.id, c.icon)),
    ...seedProblems(catalog),
    ...buildingProblems,
    ...menuProblems(catalog, missingAsset),
    ...(buildingIds.has(catalog.missions.guildBonus.building)
      ? []
      : [
          `missions.json: guildBonus uses unknown building "${catalog.missions.guildBonus.building}"`,
        ]),
  ];
}

/** Dishes need a known photo, known coins and a level the tavern can reach. */
function menuProblems(
  { tavernMenu, buildings, currencies }: Catalog,
  missingAsset: (owner: string, key: string) => string[],
): string[] {
  const { items } = tavernMenu;
  if (items.length === 0) return [];
  const tavern = buildings.find((b) => b.id === TAVERN_BUILDING_ID);
  const maxLevel = tavern?.levels.length ?? 0;
  const currencyIds = new Set(currencies.map((c) => c.id));
  return [
    ...(tavern ? [] : [`tavern_menu.json: building "${TAVERN_BUILDING_ID}" is missing`]),
    ...duplicates('menu item', items),
    ...items.flatMap((item) => [
      ...missingAsset(`menu ${item.id}`, item.image),
      ...Object.keys(item.price ?? {})
        .filter((id) => !currencyIds.has(id))
        .map((id) => `menu ${item.id}: unknown coin "${id}"`),
      ...((item.minLevel ?? 1) > maxLevel
        ? [`menu ${item.id}: minLevel ${item.minLevel} is above the tavern's ${maxLevel} levels`]
        : []),
    ]),
  ];
}

/** Posts must use known skills, and activity ids identify a post within a level. */
function jobProblems({ buildings, skills, npcs }: Catalog): string[] {
  const skillIds = new Set(skills.map((s) => s.id));
  const constructionActivity = npcs.construction.activity;
  const unknownSkill = (owner: string, job: JobDef) =>
    skillIds.has(job.skill)
      ? []
      : [`${owner}: post "${job.activity}" uses unknown skill "${job.skill}"`];
  const levelProblems = buildings.flatMap((b) =>
    b.levels.flatMap((level, index) => {
      const owner = `${b.id} level ${index + 1}`;
      const jobs = level.jobs ?? [];
      const ids = jobs.map((job) => ({ id: job.activity }));
      return [
        ...jobs.flatMap((job) => unknownSkill(owner, job)),
        ...duplicates(`${owner} post`, ids),
        ...(ids.some(({ id }) => id === constructionActivity)
          ? [`${owner}: post "${constructionActivity}" is reserved for constructions`]
          : []),
      ];
    }),
  );
  return [...unknownSkill('npcs.json', npcs.construction), ...levelProblems];
}

/** Housing lives only in the buildings npcs.json lists (the Alojamento). */
function housingProblems({ buildings, npcs }: Catalog): string[] {
  const housingIds = new Set(npcs.housingBuildings);
  return [
    ...npcs.housingBuildings
      .filter((id) => !buildings.some((b) => b.id === id))
      .map((id) => `npcs.json: housingBuildings lists unknown building "${id}"`),
    ...buildings
      .filter((b) => !housingIds.has(b.id) && b.levels.some((level) => level.housing))
      .map((b) => `${b.id}: housing is only allowed in npcs.json housingBuildings`),
  ];
}

/** A building with posts needs openings for every slot type it accepts, at each of its levels. */
function postSlotProblems({ buildings, npcs }: Catalog): string[] {
  return buildings
    .filter((b) => b.levels.some((level) => (level.jobs ?? []).length > 0))
    .flatMap((b) =>
      b.allowedSlots
        .filter((type) => (npcs.postSlots[type]?.length ?? 0) < b.levels.length)
        .map(
          (type) => `npcs.json: postSlots "${type}" needs ${b.levels.length} levels for ${b.id}`,
        ),
    );
}

/** Every slot type a building accepts must exist, and no slot may sit on a reserved stretch. */
function layoutProblems({ buildings, layout }: Catalog): string[] {
  const slotTypes = new Set(layout.slots.map((s) => s.type));
  const onReserved = (slot: SlotDef) =>
    slot.type === 'outer' &&
    layout.reserved.some((r) =>
      angleRangesOverlap([slot.arc.startAngle, slot.arc.endAngle], [r.startAngle, r.endAngle]),
    );
  return [
    ...buildings.flatMap((b) =>
      b.allowedSlots
        .filter((type) => !slotTypes.has(type))
        .map((type) => `${b.id}: allowedSlots "${type}" has no slot in layout.json`),
    ),
    ...layout.slots
      .filter(onReserved)
      .map((s) => `layout.json: ${s.id} overlaps a reserved stretch of the wall`),
  ];
}

function currencyProblems(currencies: readonly CurrencyDef[]): string[] {
  const hasGold = currencies.some((c) => c.id === GOLD_CURRENCY_ID);
  // Change is paid in smaller coins; a coin worth 1 bronze guarantees it is always exact.
  const hasUnitCoin = currencies.some((c) => c.bronzeValue === 1);
  return [
    ...(hasGold ? [] : [`currencies.json: a currency with id "${GOLD_CURRENCY_ID}" is required`]),
    ...(hasUnitCoin ? [] : ['currencies.json: one currency must have bronzeValue 1']),
  ];
}

function seedProblems({ currencies, seed }: Catalog): string[] {
  const currencyIds = new Set(currencies.map((c) => c.id));
  const wallets = [seed.wallets.camp, ...seed.wallets.characters.map((c) => c.wallet)];
  const materialCategories = new Set(seed.materials.categories.map((c) => c.id));
  const researchCategories = new Set(seed.research.categories.map((c) => c.id));
  return [
    ...duplicates('character', seed.wallets.characters),
    ...duplicates('material', seed.materials.items),
    ...duplicates('material category', seed.materials.categories),
    ...duplicates('research', seed.research.entries),
    ...duplicates('research category', seed.research.categories),
    ...wallets
      .flatMap((wallet) => Object.keys(wallet))
      .filter((id) => !currencyIds.has(id))
      .map((id) => `wallets.json: unknown currency "${id}"`),
    ...seed.materials.items
      .filter((m) => !materialCategories.has(m.category))
      .map((m) => `materials.json: ${m.id} uses unknown category "${m.category}"`),
    ...seed.research.entries
      .filter((r) => !researchCategories.has(r.category))
      .map((r) => `research.json: ${r.id} uses unknown category "${r.category}"`),
  ];
}

function duplicates(kind: string, items: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  return items.flatMap(({ id }) => {
    if (seen.has(id)) return [`duplicate ${kind} id "${id}"`];
    seen.add(id);
    return [];
  });
}
