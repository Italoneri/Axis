import { z } from 'zod';
import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import { gameStateSchema, SAVE_VERSION, type GameState } from '../model/schema';

export const STORAGE_KEY = 'axis-base-builder:save';

export type ParseResult = { ok: true; state: GameState } | { ok: false; error: string };

export function createInitialState(catalog: Catalog): GameState {
  return {
    version: SAVE_VERSION,
    day: 1,
    resources: Object.fromEntries(catalog.resources.map((r) => [r.id, r.initial])),
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
    return { ok: false, error: `invalid JSON: ${message}` };
  }

  const result = gameStateSchema.safeParse(json);
  if (!result.success) return { ok: false, error: z.prettifyError(result.error) };

  const unknownRefs = Object.entries(result.data.slots).flatMap(([slotId, placed]) => [
    ...(findSlot(catalog, slotId) ? [] : [`unknown slot "${slotId}"`]),
    ...(findBuilding(catalog, placed.buildingId)
      ? []
      : [`unknown building "${placed.buildingId}"`]),
  ]);
  if (unknownRefs.length > 0) return { ok: false, error: unknownRefs.join('; ') };

  return { ok: true, state: result.data };
}

/** Loads the saved game, falling back to a fresh one when nothing usable is stored. */
export function loadState(storage: Storage, catalog: Catalog): GameState {
  const text = storage.getItem(STORAGE_KEY);
  if (text === null) return createInitialState(catalog);

  const parsed = parseSave(text, catalog);
  if (parsed.ok) return parsed.state;

  // Keep the broken save around so it can be recovered by hand instead of silently lost.
  console.error('[save] stored game is invalid, starting fresh', parsed.error);
  storage.setItem(`${STORAGE_KEY}:corrupted`, text);
  return createInitialState(catalog);
}

export function persistState(storage: Storage, state: GameState): void {
  storage.setItem(STORAGE_KEY, serializeState(state));
}
