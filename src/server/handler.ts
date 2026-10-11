import { z } from 'zod';
import { actorName, applyCommand, type CommandOutcome } from '../commands/applyCommand';
import type { CommandContext } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import { parseState } from '../systems/SaveSystem';
import type { GameDb, MemberGame } from './gameDb';

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

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('command'),
    gameId: z.uuid(),
    /** Validated by applyCommand, so a bad command gets the game's own error. */
    command: z.unknown(),
    expectedRevision: z.number().int().nonnegative(),
  }),
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
};

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
