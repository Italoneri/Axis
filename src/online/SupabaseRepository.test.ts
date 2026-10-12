import { describe, expect, it, vi } from 'vitest';
import type { GameCommand } from '../commands/schema';
import { serverCatalog } from '../server/catalog';
import { handleGameRequest } from '../server/handler';
import { MemoryDb } from '../server/memoryDb';
import { GameStore, type StoreHooks } from '../store';
import { createInitialState } from '../systems/SaveSystem';
import { onlineConfig } from './config';
import { SupabaseRepository, type GameBackend } from './SupabaseRepository';

const noPhotos = { signPhotos: () => Promise.resolve({}) };

const MASTER = 'user-master';
const PLAYER = 'user-player';

/**
 * A backend whose "Edge Function" is the real handler over an in-memory
 * database, and whose realtime fans out every saved state to all watchers.
 */
async function onlineWorld() {
  const db = new MemoryDb();
  const gameId = await db.createGame('Axis', createInitialState(serverCatalog), MASTER);
  const watchers = new Set<(state: unknown) => void>();
  const backendFor = (userId: string): GameBackend => ({
    fetchState: () => Promise.resolve(db.games.get(gameId)?.state),
    callFunction: async (body) => {
      const response = await handleGameRequest(
        { authorization: `Bearer ${userId}`, body },
        {
          db,
          catalog: serverCatalog,
          auth: { userFromToken: (t) => Promise.resolve(t) },
          photos: noPhotos,
        },
      );
      if (response.status === 200) watchers.forEach((watch) => watch(db.games.get(gameId)?.state));
      return response;
    },
    watchState: (_id, onState) => {
      watchers.add(onState);
      return () => watchers.delete(onState);
    },
  });
  return { db, gameId, backendFor };
}

function hooks(): StoreHooks & { refused: string[] } {
  const refused: string[] = [];
  return {
    refused,
    // The client may claim anything: the server decides from the login.
    contextFor: () => ({ actor: { role: 'master' } }),
    onRefused: (error) => refused.push(error),
    onPersistError: (error) => refused.push(`persist: ${String(error)}`),
  };
}

const advance: GameCommand = { type: 'advance_days', days: 2 };

describe('SupabaseRepository with the real game function', () => {
  it('saves a master command on the server', async () => {
    const { db, gameId, backendFor } = await onlineWorld();
    const repo = new SupabaseRepository(backendFor(MASTER), gameId, serverCatalog);
    const store = await GameStore.open(serverCatalog, repo, hooks());

    store.dispatch(advance);
    await store.whenSynced();
    expect(db.games.get(gameId)).toMatchObject({ revision: 1, state: { day: 3 } });
    expect(store.current).toMatchObject({ day: 3, revision: 1 });
  });

  it('undoes what the server refuses, even if the client thought it was the master', async () => {
    const { db, gameId, backendFor } = await onlineWorld();
    db.players.set(`${gameId}:${PLAYER}`, { role: 'player', characterId: null });
    const storeHooks = hooks();
    const repo = new SupabaseRepository(backendFor(PLAYER), gameId, serverCatalog);
    const store = await GameStore.open(serverCatalog, repo, storeHooks);

    store.dispatch(advance);
    expect(store.current.day).toBe(3);
    await store.whenSynced();
    expect(storeHooks.refused).toEqual(['forbidden']);
    expect(store.current.day).toBe(1);
    expect(db.games.get(gameId)?.revision).toBe(0);
  });

  it('shows changes another player saved, through realtime', async () => {
    const { gameId, backendFor } = await onlineWorld();
    const mine = await GameStore.open(
      serverCatalog,
      new SupabaseRepository(backendFor(MASTER), gameId, serverCatalog),
      hooks(),
    );
    const theirs = await GameStore.open(
      serverCatalog,
      new SupabaseRepository(backendFor(MASTER), gameId, serverCatalog),
      hooks(),
    );

    theirs.dispatch(advance);
    await theirs.whenSynced();
    expect(mine.current).toMatchObject({ day: 3, revision: 1 });
  });

  it('reports a conflict and replays on top of the newer game', async () => {
    const { db, gameId, backendFor } = await onlineWorld();
    const backend = backendFor(MASTER);
    const store = await GameStore.open(
      serverCatalog,
      new SupabaseRepository(
        { ...backend, watchState: () => () => undefined },
        gameId,
        serverCatalog,
      ),
      hooks(),
    );
    // Someone else saves while this store is not listening.
    await backend.callFunction({
      action: 'command',
      gameId,
      command: advance,
      expectedRevision: 0,
    });

    store.dispatch(advance);
    await store.whenSynced();
    expect(db.games.get(gameId)).toMatchObject({ revision: 2, state: { day: 5 } });
    expect(store.current.day).toBe(5);
  });

  it('reports a failing function instead of treating it as a rule', async () => {
    const storeHooks = hooks();
    const backend: GameBackend = {
      fetchState: () => Promise.resolve(createInitialState(serverCatalog)),
      callFunction: () => Promise.resolve({ status: 500, body: { error: 'internal' } }),
      watchState: () => () => undefined,
    };
    const store = await GameStore.open(
      serverCatalog,
      new SupabaseRepository(backend, 'g', serverCatalog),
      storeHooks,
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.dispatch(advance);
    await store.whenSynced();
    expect(storeHooks.refused).toEqual([
      expect.stringContaining('persist: Error: game function answered 500'),
    ]);
  });
});

describe('onlineConfig', () => {
  it.each([
    { env: {}, expected: null },
    { env: { VITE_SUPABASE_URL: 'https://x.supabase.co' }, expected: null },
    { env: { VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: 'k' }, expected: null },
    {
      env: { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' },
      expected: { url: 'https://x.supabase.co', anonKey: 'anon' },
    },
  ])('goes online only with both variables: $env', ({ env, expected }) => {
    expect(onlineConfig(env)).toEqual(expected);
  });
});
