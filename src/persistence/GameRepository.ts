import type { CommandError } from '../commands/applyCommand';
import type { CommandContext, GameCommand } from '../commands/schema';
import type { GameState } from '../model/schema';

/** One change for the repository to apply on top of the stored game. */
export type GameChange =
  /** `ctx` is what this device believes; an online repository uses the server's instead. */
  | { kind: 'command'; command: GameCommand; ctx: CommandContext }
  /** An imported save: it replaces whatever is stored. */
  | { kind: 'restore'; state: GameState };

export type SubmitResult =
  | { ok: true; state: GameState }
  /** Someone else changed the game since `expectedRevision`: reload and try again. */
  | { ok: false; reason: 'conflict' }
  /** The rules (or permissions) refused the change against the stored game. */
  | { ok: false; reason: 'refused'; error: CommandError };

/**
 * Where the shared game lives. It receives changes, never finished states, so
 * the side that stores the game is also the one that applies the rules:
 * localStorage offline, the Supabase Edge Function online.
 */
export interface GameRepository {
  load(): Promise<GameState>;
  /**
   * Applies `change` only if the stored revision still is `expectedRevision`.
   * Throws when storage or the network itself fails.
   */
  submit(change: GameChange, expectedRevision: number): Promise<SubmitResult>;
  /** Changes written by someone else (another tab offline, another player online). */
  subscribe(onRemoteChange: (state: GameState) => void): () => void;
}
