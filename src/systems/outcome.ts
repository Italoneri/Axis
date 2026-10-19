import type { GameState, LogEntry } from '../model/schema';

/** Expected refusals of master and player actions; the UI turns them into messages. */
export type ActionError =
  | 'empty_name'
  | 'name_too_long'
  /** A shop item priced at zero bronze. */
  | 'empty_price'
  | 'duplicate_name'
  | 'duplicate_id'
  | 'not_found'
  | 'category_not_empty'
  | 'insufficient_coins'
  | 'nothing_to_move'
  /** An adjustment that would leave everything as it is (removing from an empty stock). */
  | 'nothing_changed'
  | 'same_wallet'
  | 'character_has_coins'
  /** NPCs: work needs a home. */
  | 'no_home'
  /** The building has no housing left. */
  | 'home_full'
  /** The slot offers no housing at all: empty, first construction or no `housing`. */
  | 'no_housing'
  | 'post_full'
  /** The building offers no such post at its level in force. */
  | 'invalid_post'
  /** A research post needs a research in progress. */
  | 'invalid_target'
  /** The mission is not at the stage the action needs (open, out with the group, back…). */
  | 'mission_closed'
  /** Only NPCs available or working can leave on a mission. */
  | 'npc_unavailable'
  | 'empty_reward'
  /** Forcing one more copy than the building's `maxCount` (say, a 5th Alojamento). */
  | 'building_limit'
  /** A material already has its shop item; one per material. */
  | 'material_already_listed'
  /** The shop does not have that many units left. */
  | 'out_of_stock'
  /** The item is hidden, locked above the Entreposto level, or its material is gone. */
  | 'not_for_sale'
  /** A purchase or sale quantity outside 1..limit. */
  | 'invalid_quantity'
  /** Garden: the herb garden is not built, so nothing grows. */
  | 'garden_not_built'
  /** Garden: no such plot at the level in force. */
  | 'unknown_plot'
  | 'plot_occupied'
  | 'plot_empty'
  | 'not_ready'
  /** The crop does not grow in that kind of plot. */
  | 'wrong_plot_type'
  /** No seed in stock and the player is not buying one. */
  | 'no_seed'
  /** Rare crops have no price and are not sold in the garden. */
  | 'rare_not_for_sale'
  /** One crop per seed material. */
  | 'crop_already_exists'
  /** A plot still grows the crop. */
  | 'crop_in_use'
  /** Lab: the arcane lab is not built, so nothing brews. */
  | 'lab_not_built'
  /** Lab: no such station at the level in force. */
  | 'unknown_station'
  | 'station_busy'
  | 'station_empty'
  /** The recipe is brewed on another kind of station. */
  | 'wrong_station_type'
  /** A player brewing without every ingredient in stock. */
  | 'missing_ingredients'
  | 'recipe_already_exists';

export type Outcome = { ok: true; state: GameState } | { ok: false; error: ActionError };

export const ok = (state: GameState): Outcome => ({ ok: true, state });
export const fail = (error: ActionError): Outcome => ({ ok: false, error });

/**
 * The save keeps only the latest entries so it does not grow forever. In phase 3
 * the full history moves to its own table and this stays a recent window.
 */
export const LOG_LIMIT = 200;

export function trimLog(log: readonly LogEntry[]): LogEntry[] {
  return log.slice(-LOG_LIMIT);
}

export function withLog(state: GameState, ...entries: LogEntry[]): GameState {
  return { ...state, log: [...state.log, ...entries] };
}
