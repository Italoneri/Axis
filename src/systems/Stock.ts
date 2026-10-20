import {
  stockRefKey,
  type Crop,
  type GameState,
  type Recipe,
  type StockRef,
} from '../model/schema';
import type { Actor } from '../commands/schema';
import { groupItem, type Depot } from './Depot';
import { addStock, findMaterial } from './Materials';

// Stock refs: the garden and the lab take and put things either in a material
// or in an item of the group's Depósito (docs/plans/DEPOSITO.md). Depot items
// live outside the GameState, so rules only emit moves for them.

/** A change to one depot item. Player spends are strict (a shortage refuses), the master's clamp. */
export interface StockMove {
  itemId: string;
  delta: number;
  mode: 'strict' | 'clamp';
}

export function sameRef(a: StockRef, b: StockRef): boolean {
  return refKey(a) === refKey(b);
}

export const refKey = stockRefKey;

export function parseRefKey(key: string): StockRef | undefined {
  const id = key.slice(2);
  if (!id) return undefined;
  if (key.startsWith('m:')) return { source: 'material', materialId: id };
  if (key.startsWith('d:')) return { source: 'depot', itemId: id };
  return undefined;
}

/**
 * What the rules may know of a depot item: the group's items a command
 * references, read before it runs. `live`: in use (not in the trash).
 * Private items never get here: they behave as missing.
 */
export interface DepotItemView {
  id: string;
  name: string;
  quantity: number;
  live: boolean;
  /** Online, the commit refuses when the row changed since it was read. */
  updatedAt: string;
}

export type DepotSnapshot = readonly DepotItemView[];

/** The group's items among `itemIds` (all of them when omitted), as the rules see them. */
export function depotSnapshot(depot: Depot, itemIds?: readonly string[]): DepotSnapshot {
  const wanted = itemIds && new Set(itemIds);
  return depot.items.flatMap((item) => {
    if (wanted && !wanted.has(item.id)) return [];
    const section = depot.sections.find((s) => s.id === item.sectionId);
    if (!section || section.ownerId !== null) return [];
    const live = groupItem(depot, item.id) !== undefined;
    const { id, name, quantity, updatedAt } = item;
    return [{ id, name, quantity, live, updatedAt }];
  });
}

export function liveItem(depot: DepotSnapshot, itemId: string): DepotItemView | undefined {
  return depot.find((item) => item.id === itemId && item.live);
}

/** Undefined when the material is gone or the item is not in use in the group's depot. */
export function refName(ref: StockRef, state: GameState, depot: DepotSnapshot): string | undefined {
  return ref.source === 'material'
    ? findMaterial(state.materials, ref.materialId)?.name
    : liveItem(depot, ref.itemId)?.name;
}

/** The name an item had when it went to the trash, for the log of what was lost; '' when unknown. */
export function lostName(itemId: string, depot: DepotSnapshot): string {
  return depot.find((item) => item.id === itemId)?.name ?? '';
}

export function refQuantity(ref: StockRef, state: GameState, depot: DepotSnapshot): number {
  return ref.source === 'material'
    ? (findMaterial(state.materials, ref.materialId)?.quantity ?? 0)
    : (liveItem(depot, ref.itemId)?.quantity ?? 0);
}

export function refExists(ref: StockRef, state: GameState, depot: DepotSnapshot): boolean {
  return refName(ref, state, depot) !== undefined;
}

/** Depot item ids among `refs`, without repeats. */
export function depotIdsOf(refs: readonly StockRef[]): string[] {
  return [...new Set(refs.flatMap((ref) => (ref.source === 'depot' ? [ref.itemId] : [])))];
}

/** Hash input for automatic looks and colors: materials keep their id, so old crops keep their look. */
export function refHashKey(ref: StockRef): string {
  return ref.source === 'material' ? ref.materialId : refKey(ref);
}

/** Players spend strictly; the master takes what there is and the rest comes free. */
export function spendMode(actor: Actor): StockMove['mode'] {
  return actor.role === 'master' ? 'clamp' : 'strict';
}

/**
 * One move per item, in first-seen order; items that net to zero are dropped.
 * Spends on one item must share a mode: a command is either the master's or a player's.
 */
export function sumMoves(moves: readonly StockMove[]): StockMove[] {
  const merged = new Map<string, StockMove>();
  const spendModes = new Map<string, StockMove['mode']>();
  for (const move of moves) {
    if (move.delta < 0) {
      const seen = spendModes.get(move.itemId);
      if (seen && seen !== move.mode) throw new Error(`mixed spend modes on ${move.itemId}`);
      spendModes.set(move.itemId, move.mode);
    }
    const before = merged.get(move.itemId);
    merged.set(move.itemId, {
      itemId: move.itemId,
      delta: (before?.delta ?? 0) + move.delta,
      mode: 'strict',
    });
  }
  return [...merged.values()]
    .filter((move) => move.delta !== 0)
    .map((move) => ({ ...move, mode: spendModes.get(move.itemId) ?? 'strict' }));
}

export interface Gain {
  state: GameState;
  stock: StockMove[];
  name: string;
  lost: { lost?: true };
}

/** What adding `quantity` of `ref` does; undefined for a material that is gone (nothing to log). */
export function gainStock(
  ref: StockRef,
  quantity: number,
  state: GameState,
  depot: DepotSnapshot,
): Gain | undefined {
  if (ref.source === 'material') {
    const name = refName(ref, state, depot);
    if (name === undefined) return undefined;
    return { state: addStock(state, ref.materialId, quantity), stock: [], name, lost: {} };
  }
  const item = liveItem(depot, ref.itemId);
  if (!item) return { state, stock: [], name: lostName(ref.itemId, depot), lost: { lost: true } };
  const move = { itemId: item.id, delta: quantity, mode: 'strict' } as const;
  return { state, stock: [move], name: item.name, lost: {} };
}

/** What in the garden and the lab points at a depot item (the 🔗 on its card). */
export interface ItemLinks {
  seedOf: Crop[];
  harvestOf: Crop[];
  outputOf: Recipe[];
  ingredientOf: Recipe[];
}

export function itemLinks(state: GameState, itemId: string): ItemLinks {
  const isItem = (ref: StockRef) => ref.source === 'depot' && ref.itemId === itemId;
  const { crops } = state.garden;
  const { recipes } = state.lab;
  return {
    seedOf: crops.filter((crop) => isItem(crop.seed)),
    harvestOf: crops.filter((crop) => isItem(crop.harvest)),
    outputOf: recipes.filter((recipe) => isItem(recipe.output)),
    ingredientOf: recipes.filter((recipe) => recipe.ingredients.some((i) => isItem(i.ref))),
  };
}

export function hasLinks(links: ItemLinks): boolean {
  return Object.values(links).some((list) => list.length > 0);
}
