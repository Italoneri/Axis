import { z } from 'zod';
import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import { gameStateSchema, SAVE_VERSION, type GameState } from '../model/schema';

export const STORAGE_KEY = 'axis-base-builder:save';

export type ParseResult =
  | { ok: true; state: GameState }
  /** `outdated`: a save from an older format, discarded instead of migrated. */
  | { ok: false; error: string; outdated: boolean };

export function createInitialState(catalog: Catalog): GameState {
  const { wallets, materials, research, influence } = catalog.seed;
  return {
    version: SAVE_VERSION,
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
    influence,
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

  const version = z.object({ version: z.number() }).safeParse(json);
  if (version.success && version.data.version < SAVE_VERSION) {
    return { ok: false, error: `save version ${version.data.version}`, outdated: true };
  }

  const result = gameStateSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: z.prettifyError(result.error), outdated: false };
  }

  const problems = referenceProblems(result.data, catalog);
  if (problems.length > 0) return { ok: false, error: problems.join('; '), outdated: false };

  return { ok: true, state: result.data };
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
  const wallets = [state.wallets.camp, ...Object.values(state.wallets.characters)];

  return [
    ...Object.entries(state.slots).flatMap(([slotId, placed]) => [
      ...(findSlot(catalog, slotId) ? [] : [`unknown slot "${slotId}"`]),
      ...(findBuilding(catalog, placed.buildingId)
        ? []
        : [`unknown building "${placed.buildingId}"`]),
    ]),
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
  ];
}
