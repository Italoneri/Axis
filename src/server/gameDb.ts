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
  /** Creates the game with `ownerId` as its master; returns the game id. */
  createGame(name: string, state: unknown, ownerId: string): Promise<string>;
  createInvite(invite: NewInvite): Promise<string>;
  acceptInvite(tokenHash: string, userId: string): Promise<InviteAcceptance>;
  /** False when the invite does not exist in this game or is no longer pending. */
  revokeInvite(gameId: string, inviteId: string): Promise<boolean>;
}

export interface NewInvite {
  gameId: string;
  characterId: string;
  tokenHash: string;
  createdBy: string;
  expiresAt: Date;
}

export const inviteStatuses = ['ok', 'invalid', 'expired', 'used', 'revoked', 'is_master'] as const;
export type InviteStatus = (typeof inviteStatuses)[number];

export interface InviteAcceptance {
  status: InviteStatus;
  gameId: string | null;
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
    createGame: (name, state, ownerId) =>
      call('create_game', { game_name: name, initial_state: state, owner: ownerId }, z.uuid()),
    createInvite: (invite) =>
      call(
        'create_invite',
        {
          target_game: invite.gameId,
          invited_character: invite.characterId,
          invite_token_hash: invite.tokenHash,
          creator: invite.createdBy,
          expires: invite.expiresAt.toISOString(),
        },
        z.uuid(),
      ),
    acceptInvite: (tokenHash, userId) =>
      call(
        'accept_invite',
        { invite_token_hash: tokenHash, accepting_user: userId },
        acceptanceSchema,
      ),
    revokeInvite: (gameId, inviteId) =>
      call('revoke_invite', { target_game: gameId, invite: inviteId }, z.boolean()),
  };
}

const acceptanceSchema = z
  .object({ status: z.enum(inviteStatuses), game_id: z.uuid().nullable() })
  .transform(({ status, game_id }) => ({ status, gameId: game_id }));
