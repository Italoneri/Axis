import { z } from 'zod';
import type { LogEntry } from '../model/schema';

// The database as the Edge Function needs it. Every call is a SQL function in
// supabase/migrations, executable only with the service role.

export interface MemberGame {
  state: unknown;
  revision: number;
  role: 'master' | 'player';
  characterId: string | null;
}

export interface GameUpdate {
  gameId: string;
  expectedRevision: number;
  state: unknown;
  userId: string;
  actor: string | null;
  command: unknown;
  entries: readonly LogEntry[];
}

export interface GameDb {
  /** Null when the game does not exist or the user is not in it (indistinguishable on purpose). */
  loadForMember(gameId: string, userId: string): Promise<MemberGame | null>;
  /** False when the stored revision is no longer `expectedRevision`. */
  commitUpdate(update: GameUpdate): Promise<boolean>;
}

/** What the function needs from supabase-js: `rpc` only, so the bundle does not ship the client. */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const memberGameSchema = z
  .object({
    state: z.unknown(),
    revision: z.number().int().nonnegative(),
    role: z.enum(['master', 'player']),
    character_id: z.string().nullable(),
  })
  .nullable()
  .transform(
    (row) =>
      row && {
        state: row.state,
        revision: row.revision,
        role: row.role,
        characterId: row.character_id,
      },
  );

export function rpcGameDb(client: RpcClient): GameDb {
  const call = async <T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>) => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return schema.parse(data);
  };
  return {
    loadForMember: (gameId, userId) =>
      call('load_game_for', { target_game: gameId, member: userId }, memberGameSchema),
    commitUpdate: (update) =>
      call(
        'commit_game_update',
        {
          target_game: update.gameId,
          expected_revision: update.expectedRevision,
          next_state: update.state,
          acting_user: update.userId,
          acting_name: update.actor,
          command: update.command,
          entries: update.entries,
        },
        z.boolean(),
      ),
  };
}
