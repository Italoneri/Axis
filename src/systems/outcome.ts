import type { GameState, LogEntry } from '../model/schema';

/** Expected refusals of master and player actions; the UI turns them into messages. */
export type ActionError =
  | 'empty_name'
  | 'duplicate_name'
  | 'not_found'
  | 'category_not_empty'
  | 'insufficient_coins'
  | 'nothing_to_move'
  | 'same_wallet'
  | 'character_has_coins';

export type Outcome = { ok: true; state: GameState } | { ok: false; error: ActionError };

export const ok = (state: GameState): Outcome => ({ ok: true, state });
export const fail = (error: ActionError): Outcome => ({ ok: false, error });

export function withLog(state: GameState, ...entries: LogEntry[]): GameState {
  return { ...state, log: [...state.log, ...entries] };
}
