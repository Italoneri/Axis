import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../model/schema';
import { createInitialState } from '../systems/SaveSystem';
import { serverCatalog } from './catalog';
import { serveGame, type GameFunctionDeps } from './http';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const MASTER = 'user-master';
const PLAYER = 'user-player';
const STRANGER = 'user-stranger';
const tokens: Record<string, string> = {
  'master-jwt': MASTER,
  'player-jwt': PLAYER,
  'stranger-jwt': STRANGER,
};
const firstCharacter = serverCatalog.seed.wallets.characters[0];

interface FakeGame {
  state: GameState;
  revision: number;
  log: { revision: number; actor: unknown; command: unknown }[];
}

/** In-memory stand-in for the SQL functions in supabase/migrations. */
function fakeSupabase(game: FakeGame): GameFunctionDeps {
  const members: Record<string, { role: string; character_id: string | null }> = {
    [MASTER]: { role: 'master', character_id: null },
    [PLAYER]: { role: 'player', character_id: firstCharacter?.id ?? null },
  };
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    load_game_for: ({ target_game, member }) => {
      const row = members[String(member)];
      if (target_game !== GAME_ID || !row) return null;
      return { state: game.state, revision: game.revision, ...row };
    },
    commit_game_update: ({ expected_revision, next_state, acting_name, command }) => {
      if (expected_revision !== game.revision) return false;
      game.revision += 1;
      game.state = next_state as GameState;
      game.log.push({ revision: game.revision, actor: acting_name, command });
      return true;
    },
  };
  return {
    userFromToken: (token) => Promise.resolve(tokens[token] ?? null),
    rpc: (fn, args) => {
      const handler = handlers[fn];
      if (!handler) return Promise.resolve({ data: null, error: { message: `no ${fn}` } });
      return Promise.resolve({ data: handler(args), error: null });
    },
  };
}

function post(body: unknown, token: string | null = 'master-jwt'): Request {
  return new Request('http://localhost/functions/v1/game', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

const advance = { type: 'advance_days', days: 1 };
const commandBody = (command: unknown, expectedRevision = 0) => ({
  action: 'command',
  gameId: GAME_ID,
  command,
  expectedRevision,
});

async function call(request: Request, game: FakeGame) {
  const response = await serveGame(request, fakeSupabase(game));
  const body: unknown = await response.json();
  return { status: response.status, body };
}

describe('game Edge Function', () => {
  let game: FakeGame;
  beforeEach(() => {
    game = { state: createInitialState(serverCatalog), revision: 0, log: [] };
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('applies a valid command, saves it and logs who ran it', async () => {
    const { status, body } = await call(post(commandBody(advance)), game);
    expect(status).toBe(200);
    expect(body).toMatchObject({ state: { day: 2, revision: 1 } });
    expect(game.revision).toBe(1);
    expect(game.log).toEqual([{ revision: 1, actor: 'Mestre', command: advance }]);
  });

  it.each([
    { name: 'missing', token: null },
    { name: 'invalid', token: 'forged-jwt' },
  ])('answers 401 to a $name JWT', async ({ token }) => {
    const { status, body } = await call(post(commandBody(advance), token), game);
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
    expect(game.revision).toBe(0);
  });

  it('refuses a master command from a player with 403, whatever the client claims', async () => {
    const request = post(
      { ...commandBody(advance), ctx: { actor: { role: 'master' } } },
      'player-jwt',
    );
    const { status, body } = await call(request, game);
    expect(status).toBe(403);
    expect(body).toEqual({ error: 'refused', reason: 'forbidden' });
    expect(game.revision).toBe(0);
  });

  it('lets a player deposit from their own character', async () => {
    const characterId = firstCharacter?.id ?? '';
    const coins = Object.fromEntries(Object.entries(firstCharacter?.wallet ?? {}).slice(0, 1));
    const deposit = { type: 'deposit', characterId, coins };
    const { status } = await call(post(commandBody(deposit), 'player-jwt'), game);
    expect(status).toBe(200);
    expect(game.log[0]?.actor).toBe(firstCharacter?.name);
  });

  it('answers 409 when the expected revision is stale', async () => {
    game.revision = 3;
    const { status, body } = await call(post(commandBody(advance, 2)), game);
    expect(status).toBe(409);
    expect(body).toEqual({ error: 'conflict', revision: 3 });
  });

  it('answers 409 when someone saves between the read and the write', async () => {
    const deps = fakeSupabase(game);
    const racing: GameFunctionDeps = {
      ...deps,
      rpc: (fn, args) =>
        fn === 'commit_game_update'
          ? Promise.resolve({ data: false, error: null })
          : deps.rpc(fn, args),
    };
    const response = await serveGame(post(commandBody(advance)), racing);
    expect(response.status).toBe(409);
  });

  it('answers 403 to someone outside the game', async () => {
    const { status, body } = await call(post(commandBody(advance), 'stranger-jwt'), game);
    expect(status).toBe(403);
    expect(body).toEqual({ error: 'not_member' });
  });

  it('answers 422 to a malformed request or command', async () => {
    expect((await call(post({ action: 'command', gameId: 'x' }), game)).status).toBe(422);
    const { status, body } = await call(post(commandBody({ type: 'cheat' })), game);
    expect(status).toBe(422);
    expect(body).toEqual({ error: 'refused', reason: 'invalid_command' });
  });

  it('answers 500 without details when the database fails', async () => {
    const broken: GameFunctionDeps = {
      ...fakeSupabase(game),
      rpc: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
    };
    const response = await serveGame(post(commandBody(advance)), broken);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal' });
  });

  it('answers CORS preflight', async () => {
    const response = await serveGame(
      new Request('http://localhost/functions/v1/game', { method: 'OPTIONS' }),
      fakeSupabase(game),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
