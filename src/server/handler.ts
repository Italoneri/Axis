import { z } from 'zod';
import { actorName, applyCommand, MASTER_ACTOR } from '../commands/applyCommand';
import { depotItemsNeeded } from '../commands/depotItemsNeeded';
import { gameCommandSchema } from '../commands/schema';
import type { DepotDelivery } from '../systems/Depot';
import { createInitialState, parseState, type ParseResult } from '../systems/SaveSystem';
import {
  conflict,
  contextOf,
  isGame,
  loadAsMaster,
  randomToken,
  refusal,
  reply,
  sha256Hex,
  type AuthPort,
  type Caller,
  type GameResponse,
  type HandlerDeps,
} from './caller';
import type { InviteStatus, StockCommitStatus } from './gameDb';
import {
  createJoinLink,
  joinChoiceSchema,
  joinGame,
  joinTokenSchema,
  MAX_JOIN_LINK_DAYS,
  previewJoin,
  revokeJoinLink,
  unlinkPlayer,
} from './joining';

// Core of the `game` Edge Function: plain TypeScript with its dependencies
// injected, so Vitest runs it in Node and the bundle runs it in Deno.

export type { AuthPort, GameResponse, HandlerDeps, PhotoSigner } from './caller';
export { sha256Hex } from './caller';

export interface GameRequest {
  authorization: string | null;
  body: unknown;
}

const DEFAULT_INVITE_DAYS = 7;
const MAX_INVITE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('command'),
    gameId: z.uuid(),
    /** Validated by applyCommand, so a bad command gets the game's own error. */
    command: z.unknown(),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal('create_game'),
    name: z.string().trim().min(1).max(80),
    /** An exported save to start from; absent starts from the seed. */
    state: z.unknown().optional(),
  }),
  z.object({
    action: z.literal('restore_save'),
    gameId: z.uuid(),
    state: z.unknown(),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    action: z.literal('create_invite'),
    gameId: z.uuid(),
    characterId: z.string().min(1),
    expiresInDays: z.number().int().min(1).max(MAX_INVITE_DAYS).default(DEFAULT_INVITE_DAYS),
  }),
  z.object({ action: z.literal('accept_invite'), token: z.string().min(16).max(128) }),
  z.object({ action: z.literal('revoke_invite'), gameId: z.uuid(), inviteId: z.uuid() }),
  z.object({
    action: z.literal('create_join_link'),
    gameId: z.uuid(),
    /** Absent: valid until revoked. */
    expiresInDays: z.number().int().min(1).max(MAX_JOIN_LINK_DAYS).optional(),
  }),
  z.object({ action: z.literal('revoke_join_link'), gameId: z.uuid(), linkId: z.uuid() }),
  z.object({ action: z.literal('join_preview'), token: joinTokenSchema }),
  z.object({ action: z.literal('join_game'), token: joinTokenSchema, choice: joinChoiceSchema }),
  z.object({ action: z.literal('unlink_player'), gameId: z.uuid(), userId: z.uuid() }),
]);

type GameAction = z.infer<typeof requestSchema>;
type ActionOf = { [A in GameAction as A['action']]: A };
type ActionName = keyof ActionOf;
type Actions = {
  [K in ActionName]: (request: ActionOf[K], caller: Caller) => Promise<GameResponse>;
};

export async function handleGameRequest(
  request: GameRequest,
  deps: HandlerDeps,
): Promise<GameResponse> {
  const userId = await authenticate(request.authorization, deps.auth);
  if (!userId) return reply(401, { error: 'unauthorized' });
  const parsed = requestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply(422, { error: 'invalid_request', detail: z.prettifyError(parsed.error) });
  }
  return run(parsed.data.action, parsed.data, { ...deps, userId });
}

/** The history never names an item filed in a private area, so the purchase drops what points to it. */
function loggedCommand(raw: unknown, delivery: DepotDelivery): unknown {
  const parsed = gameCommandSchema.safeParse(raw);
  if (!parsed.success || parsed.data.type !== 'shop_buy' || delivery.ownerId === null) return raw;
  const { type, quantity, payer } = parsed.data;
  return { type, quantity, payer };
}

function run<K extends ActionName>(
  action: K,
  request: ActionOf[K],
  caller: Caller,
): Promise<GameResponse> {
  const handler: Actions[K] = actions[action];
  return handler(request, caller);
}

const actions: Actions = {
  command: async ({ gameId, command, expectedRevision }, { userId, db, catalog }) => {
    // Not found and not a member answer the same, so ids of other games reveal nothing.
    const game = await db.loadForMember(gameId, userId);
    if (!game) return reply(403, { error: 'not_member' });
    if (game.revision !== expectedRevision) return conflict(game.revision);

    const stored = parseState(game.state, catalog);
    if (!stored.ok) throw new Error(`stored game ${gameId} is invalid: ${stored.error}`);
    // The rules see only the group items this command uses, read now and checked again at commit.
    const itemIds = depotItemsNeeded(stored.state, command);
    const depot = itemIds.length > 0 ? await db.loadDepotItems(gameId, itemIds) : [];
    const ctx = { ...contextOf(game), depot };
    const outcome = applyCommand(stored.state, catalog, command, ctx);
    if (!outcome.ok) return refusal(outcome);
    if (outcome.state === stored.state) return reply(200, { state: stored.state });

    const update = {
      gameId,
      expectedRevision,
      state: outcome.state,
      userId,
      actor: actorName(stored.state, ctx) ?? null,
      command,
      entries: outcome.logged,
    };
    const delivery = outcome.change.kind === 'shop_purchased' ? outcome.change.delivery : null;
    if (delivery) {
      const bought = { ...update, command: loggedCommand(command, delivery), delivery };
      return (await db.commitPurchase(bought)) ? reply(200, { state: outcome.state }) : conflict();
    }
    if (depot.length === 0 && outcome.stock.length === 0) {
      return (await db.commitUpdate(update)) ? reply(200, { state: outcome.state }) : conflict();
    }
    const status = await db.commitWithStock({ ...update, moves: outcome.stock, reads: depot });
    return stockReply(status, command, outcome.state);
  },

  create_game: async ({ name, state }, { userId, db, catalog }) => {
    const initial: ParseResult =
      state === undefined
        ? { ok: true, state: createInitialState(catalog) }
        : parseState(state, catalog);
    if (!initial.ok) return reply(422, { error: 'invalid_save', detail: initial.error });
    // A new game starts its own history, whatever revision the imported save had.
    const gameId = await db.createGame(name, { ...initial.state, revision: 0 }, userId);
    return reply(201, { gameId });
  },

  restore_save: async ({ gameId, state, expectedRevision }, caller) => {
    const game = await loadAsMaster(gameId, caller);
    if (!isGame(game)) return game;
    if (game.revision !== expectedRevision) return conflict(game.revision);
    const backup = parseState(state, caller.catalog);
    if (!backup.ok) return reply(422, { error: 'invalid_save', detail: backup.error });

    const restored = { ...backup.state, revision: expectedRevision + 1 };
    const saved = await caller.db.commitUpdate({
      gameId,
      expectedRevision,
      state: restored,
      userId: caller.userId,
      actor: MASTER_ACTOR,
      command: { type: 'restore_save' },
      entries: [],
    });
    return saved ? reply(200, { state: restored }) : conflict();
  },

  create_invite: async ({ gameId, characterId, expiresInDays }, caller) => {
    const game = await loadAsMaster(gameId, caller);
    if (!isGame(game)) return game;
    const stored = parseState(game.state, caller.catalog);
    if (!stored.ok) throw new Error(`stored game ${gameId} is invalid: ${stored.error}`);
    if (!stored.state.characters.some((c) => c.id === characterId)) {
      return reply(404, { error: 'not_found' });
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS);
    const inviteId = await caller.db.createInvite({
      gameId,
      characterId,
      tokenHash: await sha256Hex(token),
      createdBy: caller.userId,
      expiresAt,
    });
    // The only time the token exists in clear: the master shares it as a link.
    return reply(201, { inviteId, token, expiresAt: expiresAt.toISOString() });
  },

  accept_invite: async ({ token }, { userId, db }) => {
    const { status, gameId } = await db.acceptInvite(await sha256Hex(token), userId);
    if (status === 'ok') return reply(200, { gameId });
    return reply(INVITE_REFUSAL_STATUS[status], { error: `invite_${status}` });
  },

  revoke_invite: async ({ gameId, inviteId }, caller) => {
    const game = await loadAsMaster(gameId, caller);
    if (!isGame(game)) return game;
    const revoked = await caller.db.revokeInvite(gameId, inviteId);
    return revoked ? reply(200, { revoked: true }) : reply(404, { error: 'not_found' });
  },

  create_join_link: createJoinLink,
  revoke_join_link: revokeJoinLink,
  join_preview: previewJoin,
  join_game: joinGame,
  unlink_player: unlinkPlayer,
};

/** A shortage reads as the command's own refusal; a missing item as `stock_missing`. */
function stockReply(status: StockCommitStatus, command: unknown, state: unknown): GameResponse {
  if (status === 'ok') return reply(200, { state });
  if (status === 'conflict') return conflict();
  const isPlanting = gameCommandSchema.safeParse(command).data?.type === 'garden_plant';
  const short = isPlanting ? 'no_seed' : 'missing_ingredients';
  return reply(422, { error: 'refused', reason: status === 'stock_short' ? short : status });
}

const INVITE_REFUSAL_STATUS: Record<Exclude<InviteStatus, 'ok'>, number> = {
  invalid: 404,
  expired: 410,
  used: 410,
  revoked: 410,
  is_master: 409,
};

async function authenticate(authorization: string | null, auth: AuthPort): Promise<string | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  return token ? auth.userFromToken(token) : null;
}
