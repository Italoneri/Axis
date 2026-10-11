import { z } from 'zod';
import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import { gameStateSchema, SAVE_VERSION, type GameState } from '../model/schema';
import { initialInfluence } from './Influence';
import { settleNpcs } from './Npcs';
import { trimLog } from './outcome';

export const STORAGE_KEY = 'axis-base-builder:save';

export type ParseResult =
  | { ok: true; state: GameState }
  /** `outdated`: a save from an older format, discarded instead of migrated. */
  | { ok: false; error: string; outdated: boolean };

export function createInitialState(catalog: Catalog): GameState {
  const { wallets, materials, research } = catalog.seed;
  return {
    version: SAVE_VERSION,
    revision: 0,
    day: 1,
    characters: wallets.characters.map(({ id, name, color, portrait }) => ({
      id,
      name,
      color,
      ...(portrait ? { portrait } : {}),
    })),
    wallets: {
      camp: wallets.camp,
      characters: Object.fromEntries(wallets.characters.map((c) => [c.id, c.wallet])),
    },
    materials,
    research,
    influence: initialInfluence(catalog.worlds),
    npcs: [],
    slots: {},
    log: [],
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state, null, 2);
}

/** Parses an untrusted save (file import or localStorage) and checks it against the catalog. */
export function parseSave(text: string, catalog: Catalog): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `invalid JSON: ${message}`, outdated: false };
  }
  return parseState(json, catalog);
}

/** Same checks as `parseSave`, for a save already parsed from JSON (a jsonb column, a request body). */
export function parseState(json: unknown, catalog: Catalog): ParseResult {
  const migrated = migrateSave(json);
  if (!migrated.ok) return { ok: false, error: migrated.error, outdated: migrated.outdated };

  const result = gameStateSchema.safeParse(migrated.json);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error), outdated: false };
  }

  const dropped = settleNpcs(dropMissingSlots(result.data, catalog), catalog);
  const state = { ...dropped, log: trimLog(dropped.log) };
  const problems = referenceProblems(state, catalog);
  if (problems.length > 0) return { ok: false, error: problems.join('; '), outdated: false };

  return { ok: true, state };
}

type SaveJson = Record<string, unknown>;
/** Turns a save of version N into version N + 1. */
export type SaveMigration = (save: SaveJson) => SaveJson;

/**
 * Upgrades by `version`, keyed by the version each step reads. The state is a
 * versioned JSON document (a jsonb column online), so new fields such as NPCs
 * arrive with a migration here instead of a table change.
 */
export const SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  4: (save) => ({ ...save, npcs: [] }),
};

/** Saves older than this predate real games and are discarded instead of migrated. */
export const OLDEST_SUPPORTED_VERSION = 4;

const versionedSchema = z.looseObject({ version: z.number().int() });

export function migrateSave(
  json: unknown,
  migrations: Readonly<Record<number, SaveMigration>> = SAVE_MIGRATIONS,
  target: number = SAVE_VERSION,
): { ok: true; json: unknown } | { ok: false; error: string; outdated: boolean } {
  const versioned = versionedSchema.safeParse(json);
  // Not even versioned: leave it to the schema to report what is wrong.
  if (!versioned.success) return { ok: true, json };
  const { version } = versioned.data;
  if (version < OLDEST_SUPPORTED_VERSION)
    return { ok: false, error: `save version ${version}`, outdated: true };

  let save: SaveJson = versioned.data;
  for (let from = version; from < target; from++) {
    const migration = migrations[from];
    // A missing step is a bug, not an old save: keep the data instead of discarding it.
    if (!migration) {
      return { ok: false, error: `no migration from save version ${from}`, outdated: false };
    }
    save = { ...migration(save), version: from + 1 };
  }
  return { ok: true, json: save };
}

/** Buildings on slots the layout no longer has (say, fewer mid_N) are removed and logged. */
function dropMissingSlots(state: GameState, catalog: Catalog): GameState {
  const isKnown = ([slotId]: [string, unknown]) => findSlot(catalog, slotId) !== undefined;
  const entries = Object.entries(state.slots);
  const missing = entries.filter((entry) => !isKnown(entry));
  if (missing.length === 0) return state;

  console.warn(
    '[save] dropping buildings on slots missing from the layout',
    missing.map(([slotId]) => slotId),
  );
  return {
    ...state,
    slots: Object.fromEntries(entries.filter(isKnown)),
    log: [
      ...state.log,
      ...missing.map(([, placed]) => ({
        day: state.day,
        kind: 'building_dropped' as const,
        buildingId: placed.buildingId,
        level: placed.level,
      })),
    ],
  };
}

/** Loads the saved game, falling back to a fresh one when nothing usable is stored. */
export function loadState(storage: Storage, catalog: Catalog): GameState {
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return createInitialState(catalog);

  const parsed = parseSave(text, catalog);
  if (parsed.ok) return parsed.state;

  if (parsed.outdated) {
    // No real player data existed before this format, so old saves are simply dropped.
    console.info('[save] discarding save from an older format', parsed.error);
    storage.removeItem(STORAGE_KEY);
    return createInitialState(catalog);
  }

  // Keep the broken save around so it can be recovered by hand instead of silently lost.
  console.error('[save] stored game is invalid, starting fresh', parsed.error);
  storage.setItem(`${STORAGE_KEY}:corrupted`, text);
  return createInitialState(catalog);
}

export function persistState(storage: Storage, state: GameState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}

function referenceProblems(state: GameState, catalog: Catalog): string[] {
  const currencyIds = new Set(catalog.currencies.map((c) => c.id));
  const characterIds = new Set(state.characters.map((c) => c.id));
  const materialCategories = new Set(state.materials.categories.map((c) => c.id));
  const researchCategories = new Set(state.research.categories.map((c) => c.id));
  const worldIds = new Set(catalog.worlds.map((w) => w.id));
  const wallets = [state.wallets.camp, ...Object.values(state.wallets.characters)];

  return [
    ...Object.values(state.slots)
      .filter((placed) => !findBuilding(catalog, placed.buildingId))
      .map((placed) => `unknown building "${placed.buildingId}"`),
    ...wallets
      .flatMap((wallet) => Object.keys(wallet))
      .filter((id) => !currencyIds.has(id))
      .map((id) => `unknown currency "${id}"`),
    ...state.characters
      .filter((c) => !state.wallets.characters[c.id])
      .map((c) => `character "${c.id}" has no wallet`),
    ...Object.keys(state.wallets.characters)
      .filter((id) => !characterIds.has(id))
      .map((id) => `wallet of unknown character "${id}"`),
    ...state.materials.items
      .filter((m) => !materialCategories.has(m.category))
      .map((m) => `material "${m.id}" in unknown category "${m.category}"`),
    ...state.research.entries
      .filter((r) => !researchCategories.has(r.category))
      .map((r) => `research "${r.id}" in unknown category "${r.category}"`),
    ...Object.keys(state.influence)
      .filter((id) => !worldIds.has(id))
      .map((id) => `influence of unknown world "${id}"`),
  ];
}
