import { z } from 'zod';
import {
  actorName,
  applyCommand,
  MASTER_ACTOR,
  type CommandOutcome,
} from '../commands/applyCommand';
import type { CommandContext } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import { createInitialState, parseState, type ParseResult } from '../systems/SaveSystem';
import type { GameDb, InviteStatus, MemberGame } from './gameDb';

// Core of the `game` Edge Function: plain TypeScript with its dependencies
// injected, so Vitest runs it in Node and the bundle runs it in Deno.

export interface AuthPort {
  /** The user id of a valid access token; null when the token is invalid or expired. */
  userFromToken(token: string): Promise<string | null>;
}

export interface HandlerDeps {
  auth: AuthPort;
  db: GameDb;
  catalog: Catalog;
}

export interface GameRequest {
  authorization: string | null;
  body: unknown;
}

export interface GameResponse {
  status: number;
  body: Readonly<Record<string, unknown>>;
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
]);

type GameAction = z.infer<typeof requestSchema>;
type ActionOf = { [A in GameAction as A['action']]: A };
type ActionName = keyof ActionOf;
interface Caller extends HandlerDeps {
  userId: string;
}
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
    const ctx = contextOf(game);
    const outcome = applyCommand(stored.state, catalog, command, ctx);
    if (!outcome.ok) return refusal(outcome);
    if (outcome.state === stored.state) return reply(200, { state: stored.state });

    const saved = await db.commitUpdate({
      gameId,
      expectedRevision,
      state: outcome.state,
      userId,
      actor: actorName(stored.state, ctx) ?? null,
      command,
      entries: outcome.logged,
    });
    return saved ? reply(200, { state: outcome.state }) : conflict();
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
};

const INVITE_REFUSAL_STATUS: Record<Exclude<InviteStatus, 'ok'>, number> = {
  invalid: 404,
  expired: 410,
  used: 410,
  revoked: 410,
  is_master: 409,
};

/** The game when the caller is its master; otherwise the 403 to send back. */
async function loadAsMaster(
  gameId: string,
  { userId, db }: Caller,
): Promise<MemberGame | GameResponse> {
  const game = await db.loadForMember(gameId, userId);
  if (!game) return reply(403, { error: 'not_member' });
  if (game.role !== 'master') return reply(403, { error: 'refused', reason: 'forbidden' });
  return game;
}

function isGame(value: MemberGame | GameResponse): value is MemberGame {
  return 'role' in value;
}

/** 256 random bits, URL-safe: the secret part of an invite link. */
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The server's idea of who is acting: from the players table, never from the request. */
function contextOf(game: MemberGame): CommandContext {
  if (game.role === 'master') return { actor: { role: 'master' } };
  return { actor: { role: 'player', characterId: game.characterId ?? undefined } };
}

async function authenticate(authorization: string | null, auth: AuthPort): Promise<string | null> {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  return token ? auth.userFromToken(token) : null;
}

function refusal(outcome: Extract<CommandOutcome, { ok: false }>): GameResponse {
  const status = outcome.error === 'forbidden' ? 403 : 422;
  return reply(status, { error: 'refused', reason: outcome.error, reasons: outcome.reasons });
}

function conflict(revision?: number): GameResponse {
  return reply(409, { error: 'conflict', revision });
}

function reply(status: number, body: Record<string, unknown>): GameResponse {
  return { status, body };
}
