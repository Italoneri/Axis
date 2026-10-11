import type { GameState } from '../model/schema';

export type SaveResult = { ok: true } | { ok: false; reason: 'conflict' };

/**
 * Where the shared game lives. Today it is this browser's localStorage; phase 3
 * swaps in a Supabase-backed one without touching the store or the UI.
 */
export interface GameRepository {
  load(): Promise<GameState>;
  /**
   * Stores `state` only if the stored revision still is `expectedRevision`,
   * so two writers never silently overwrite each other. Throws when storage
   * itself fails (quota, private mode).
   */
  save(state: GameState, expectedRevision: number): Promise<SaveResult>;
  /** Changes written by someone else (another tab today, another player later). */
  subscribe(onRemoteChange: (state: GameState) => void): () => void;
}
