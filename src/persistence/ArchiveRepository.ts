import type { ArchiveChange } from '../model/schema';
import type { Archive, ArchiveCommand, ArchiveContext, ArchiveError } from '../systems/Archive';

export type ArchiveSubmitResult =
  { ok: true; archive: Archive; change: ArchiveChange | null } | { ok: false; error: ArchiveError };

/**
 * Where the Arquivo de registros lives, apart from the GameState: localStorage
 * offline, Supabase tables online. Both run `applyArchiveCommand`; online,
 * RLS and a trigger have the last word.
 */
export interface ArchiveRepository {
  /** What this device may see: online, players never receive the master's notes. */
  load(): Promise<Archive>;
  /** Throws when storage or the network itself fails. */
  submit(command: ArchiveCommand, ctx: ArchiveContext): Promise<ArchiveSubmitResult>;
  /** An imported save: replaces the whole archive. */
  replace(archive: Archive): Promise<void>;
  /** Changes written elsewhere (another tab offline, another player online). */
  subscribe(onRemoteChange: (archive: Archive) => void): () => void;
}
