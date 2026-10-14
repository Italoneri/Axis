import type { DepotChange } from '../model/schema';
import type { Depot, DepotCommand, DepotContext, DepotError } from '../systems/Depot';

export type DepotSubmitResult =
  { ok: true; depot: Depot; change: DepotChange | null } | { ok: false; error: DepotError };

/**
 * Where the Depósito lives, apart from the GameState: localStorage offline,
 * Supabase tables online. Both run `applyDepotCommand`; online, RLS and
 * triggers have the last word.
 */
export interface DepotRepository {
  /** What this device may see: online, players never receive another character's private area. */
  load(): Promise<Depot>;
  /** Throws when storage or the network itself fails. */
  submit(command: DepotCommand, ctx: DepotContext): Promise<DepotSubmitResult>;
  /** An imported save: replaces the whole depot. */
  replace(depot: Depot): Promise<void>;
  /** Changes written elsewhere (another tab offline, another player online). */
  subscribe(onRemoteChange: (depot: Depot) => void): () => void;
}
