import { z } from 'zod';
import type { LogEntry } from '../model/schema';
import type { DepotDelivery } from '../systems/Depot';

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
  /** commitUpdate plus the depot rows, in one transaction; false on revision conflict. */
  commitPurchase(update: GameUpdate & { delivery: DepotDelivery }): Promise<boolean>;
  /** Creates the game with `ownerId` as its master; returns the game id. */
  createGame(name: string, state: unknown, ownerId: string): Promise<string>;
  createInvite(invite: NewInvite): Promise<string>;
  acceptInvite(tokenHash: string, userId: string): Promise<InviteAcceptance>;
  /** False when the invite does not exist in this game or is no longer pending. */
  revokeInvite(gameId: string, inviteId: string): Promise<boolean>;
  createJoinLink(link: NewJoinLink): Promise<string>;
  /** False when the link does not exist in this game or was already revoked. */
  revokeJoinLink(gameId: string, linkId: string): Promise<boolean>;
  /** The game behind an entry link, for someone about to join it. */
  peekJoin(tokenHash: string, userId: string): Promise<JoinPeek>;
  /** Links the user to a character and saves the state, in one transaction. */
  joinGame(join: JoinUpdate): Promise<JoinStatus>;
  /** Removes a player's link (never the master's) and saves the state. */
  unlinkPlayer(unlink: UnlinkUpdate): Promise<UnlinkStatus>;
}

export interface NewInvite {
  gameId: string;
  characterId: string;
  tokenHash: string;
  createdBy: string;
  expiresAt: Date;
}

export interface NewJoinLink {
  gameId: string;
  tokenHash: string;
  createdBy: string;
  /** Null: valid until revoked. */
  expiresAt: Date | null;
}

export const joinLinkRefusals = ['invalid', 'revoked', 'expired'] as const;
export type JoinLinkRefusal = (typeof joinLinkRefusals)[number];

export type JoinPeek =
  | { status: JoinLinkRefusal }
  | {
      status: 'ok';
      gameId: string;
      gameName: string;
      state: unknown;
      revision: number;
      isMember: boolean;
      /** Characters that already have a player. */
      taken: string[];
    };

export interface JoinUpdate extends Omit<GameUpdate, 'gameId'> {
  tokenHash: string;
  characterId: string;
}

export const joinStatuses = [
  'ok',
  ...joinLinkRefusals,
  'already_member',
  'character_taken',
  'conflict',
] as const;
export type JoinStatus = (typeof joinStatuses)[number];

export interface UnlinkUpdate extends GameUpdate {
  unlinkedUserId: string;
}

export const unlinkStatuses = ['ok', 'not_found', 'conflict'] as const;
export type UnlinkStatus = (typeof unlinkStatuses)[number];

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
  const updateArgs = (update: GameUpdate) => ({
    target_game: update.gameId,
    expected_revision: update.expectedRevision,
    next_state: update.state,
    acting_user: update.userId,
    acting_name: update.actor,
    command: update.command,
    entries: update.entries,
  });
  return {
    loadForMember: (gameId, userId) =>
      call('load_game_for', { target_game: gameId, member: userId }, memberGameSchema),
    commitUpdate: (update) => call('commit_game_update', updateArgs(update), z.boolean()),
    commitPurchase: ({ delivery, ...update }) =>
      call('commit_shop_purchase', { ...updateArgs(update), delivery }, z.boolean()),
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
    createJoinLink: (link) =>
      call(
        'create_join_link',
        {
          target_game: link.gameId,
          link_token_hash: link.tokenHash,
          creator: link.createdBy,
          expires: link.expiresAt?.toISOString() ?? null,
        },
        z.uuid(),
      ),
    revokeJoinLink: (gameId, linkId) =>
      call('revoke_join_link', { target_game: gameId, link: linkId }, z.boolean()),
    peekJoin: (tokenHash, userId) =>
      call('peek_join', { link_token_hash: tokenHash, joining_user: userId }, joinPeekSchema),
    joinGame: (join) =>
      call(
        'join_game',
        {
          link_token_hash: join.tokenHash,
          joining_user: join.userId,
          joined_character: join.characterId,
          expected_revision: join.expectedRevision,
          next_state: join.state,
          acting_name: join.actor,
          command: join.command,
          entries: join.entries,
        },
        z.object({ status: z.enum(joinStatuses) }).transform((row) => row.status),
      ),
    unlinkPlayer: (unlink) =>
      call(
        'unlink_player',
        {
          target_game: unlink.gameId,
          unlinked_user: unlink.unlinkedUserId,
          expected_revision: unlink.expectedRevision,
          next_state: unlink.state,
          acting_user: unlink.userId,
          acting_name: unlink.actor,
          command: unlink.command,
          entries: unlink.entries,
        },
        z.enum(unlinkStatuses),
      ),
  };
}

const joinPeekSchema = z.union([
  z.object({ status: z.enum(joinLinkRefusals) }),
  z
    .object({
      status: z.literal('ok'),
      game_id: z.uuid(),
      game_name: z.string(),
      state: z.unknown(),
      revision: z.number().int().nonnegative(),
      is_member: z.boolean(),
      taken: z.array(z.string()),
    })
    .transform(({ game_id, game_name, is_member, ...rest }) => ({
      ...rest,
      gameId: game_id,
      gameName: game_name,
      isMember: is_member,
    })),
]);

const acceptanceSchema = z
  .object({ status: z.enum(inviteStatuses), game_id: z.uuid().nullable() })
  .transform(({ status, game_id }) => ({ status, gameId: game_id }));
