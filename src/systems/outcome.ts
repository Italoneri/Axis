import type { GameState, LogEntry } from '../model/schema';

/** Expected refusals of master and player actions; the UI turns them into messages. */
export type ActionError =
  | 'empty_name'
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
  | 'building_limit';

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
