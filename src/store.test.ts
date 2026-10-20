import { describe, expect, it, vi } from 'vitest';
import type { GameCommand } from './commands/schema';
import type { GameState } from './model/schema';
import { HERB_GARDEN_BUILDING_ID } from './model/catalog';
import type { GameRepository, SubmitResult } from './persistence/GameRepository';
import { LocalRepository } from './persistence/LocalRepository';
import { GameStore, type StoreHooks } from './store';
import { parseSave, STORAGE_KEY } from './systems/SaveSystem';
import { herbGardenCatalog, makeState, memoryStorage, testCatalog } from './systems/testFixtures';

const deposit: GameCommand = { type: 'deposit', characterId: 'thorin', coins: { gold: 2 } };
const advance: GameCommand = { type: 'advance_days', days: 1 };

function hooks(): StoreHooks & { refused: string[]; persistErrors: unknown[] } {
  const refused: string[] = [];
  const persistErrors: unknown[] = [];
  return {
    refused,
    persistErrors,
    contextFor: () => ({ actor: { role: 'master' } }),
    onRefused: (error) => refused.push(error),
    onPersistError: (error) => persistErrors.push(error),
  };
}

function stored(storage: Storage): GameState {
  const parsed = parseSave(storage.getItem(STORAGE_KEY) ?? '', testCatalog);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
}

async function openStore(storage: Storage, storeHooks = hooks()) {
  return GameStore.open(testCatalog, new LocalRepository(storage, testCatalog), storeHooks);
}

describe('GameStore', () => {
  it('shows a change at once and saves it with the next revision', async () => {
    const storage = memoryStorage();
    const store = await openStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.dispatch(deposit)).toBeNull();
    expect(store.current.wallets.camp).toEqual({ gold: 102 });
    expect(listener).toHaveBeenCalledWith(store.current, { kind: 'resources_changed' }, [
      { day: 1, kind: 'coins_deposited', actor: 'Mestre', character: 'Thorin', coins: { gold: 2 } },
    ]);

    await store.whenSynced();
    expect(stored(storage)).toMatchObject({ revision: 1, wallets: { camp: { gold: 102 } } });
  });

  it('reports a refusal and saves nothing', async () => {
    const storage = memoryStorage();
    const storeHooks = hooks();
    const store = await openStore(storage, storeHooks);

    expect(store.dispatch({ ...deposit, coins: { gold: 99 } })).toBe('insufficient_coins');
    await store.whenSynced();
    expect(storeHooks.refused).toEqual(['insufficient_coins']);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('replays its command on top of a change saved elsewhere first', async () => {
    const storage = memoryStorage();
    const mine = await openStore(storage);
    const theirs = await openStore(storage);

    theirs.dispatch(deposit);
    await theirs.whenSynced();
    mine.dispatch(advance);
    await mine.whenSynced();

    const saved = stored(storage);
    expect(saved).toMatchObject({ revision: 2, day: 2, wallets: { camp: { gold: 102 } } });
    expect(mine.current).toEqual(saved);
  });

  it('drops a command the newer game no longer allows', async () => {
    const storage = memoryStorage();
    const storeHooks = hooks();
    const mine = await openStore(storage, storeHooks);
    const theirs = await openStore(storage);

    theirs.dispatch({ ...deposit, coins: { gold: 5 } });
    await theirs.whenSynced();
    mine.dispatch(deposit);
    await mine.whenSynced();

    expect(storeHooks.refused).toEqual(['insufficient_coins']);
    expect(mine.current).toEqual(stored(storage));
    expect(mine.current.wallets.camp).toEqual({ gold: 105 });
  });

  it('gives up and shows the stored game after repeated conflicts', async () => {
    const storeHooks = hooks();
    const repository: GameRepository = {
      load: () => Promise.resolve(makeState()),
      submit: () => Promise.resolve({ ok: false, reason: 'conflict' }),
      subscribe: () => () => undefined,
    };
    const store = await GameStore.open(testCatalog, repository, storeHooks);

    store.dispatch(advance);
    await store.whenSynced();
    expect(storeHooks.refused).toEqual(['conflict']);
    expect(store.current).toEqual(makeState());
  });

  it('keeps playing when storage fails and retries with the next change', async () => {
    const storage = memoryStorage();
    const storeHooks = hooks();
    const store = await openStore(storage, storeHooks);
    const setItem = vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });

    store.dispatch(advance);
    await store.whenSynced();
    expect(storeHooks.persistErrors).toHaveLength(1);
    expect(store.current.day).toBe(2);

    store.dispatch(advance);
    await store.whenSynced();
    // The failed change is retried before the new one.
    expect(setItem).toHaveBeenCalledTimes(3);
    expect(stored(storage)).toMatchObject({ revision: 2, day: 3 });
  });

  it('restores an imported save over a game that moved on', async () => {
    const storage = memoryStorage();
    const mine = await openStore(storage);
    const theirs = await openStore(storage);
    theirs.dispatch(advance);
    await theirs.whenSynced();

    mine.replace(makeState({ day: 9 }));
    await mine.whenSynced();
    expect(stored(storage)).toMatchObject({ day: 9, revision: 2 });
    expect(mine.current).toEqual(stored(storage));
  });

  it('follows changes saved by another tab', async () => {
    const storage = memoryStorage();
    const events = new EventTarget();
    const repository = new LocalRepository(storage, testCatalog, events);
    const store = await GameStore.open(testCatalog, repository, hooks());
    const listener = vi.fn();
    store.subscribe(listener);

    const remote = makeState({ revision: 4, day: 6 });
    const event = new Event('storage');
    Object.assign(event, { key: STORAGE_KEY, newValue: JSON.stringify(remote) });
    events.dispatchEvent(event);

    expect(store.current).toEqual(remote);
    expect(listener).toHaveBeenCalledWith(remote, { kind: 'loaded' }, []);
  });
});

describe('GameStore and the depot', () => {
  const crop = {
    id: 'crop_hortela',
    seed: { source: 'depot', itemId: 'sem' },
    harvest: { source: 'depot', itemId: 'erva' },
    plotType: 'canteiro',
    days: 1,
    yield: 3,
    rare: true,
  } as const;
  const plant: GameCommand = {
    type: 'garden_plant',
    plotId: 'canteiro-1',
    cropId: 'crop_hortela',
    buy: false,
  };
  const depot = [
    { id: 'sem', name: 'Semente', quantity: 1, live: true, updatedAt: 'x' },
    { id: 'erva', name: 'Hortelã', quantity: 0, live: true, updatedAt: 'x' },
  ];
  const state = makeState({
    slots: { outer_n: { buildingId: HERB_GARDEN_BUILDING_ID, level: 1, status: 'done' } },
    garden: { crops: [crop], plots: {} },
  });

  function depotHooks() {
    const events: string[] = [];
    const base = hooks();
    return {
      ...base,
      events,
      contextFor: () => ({ actor: { role: 'player', characterId: 'thorin' }, depot }) as const,
      onStock: (moves: readonly unknown[]) => events.push(`preview:${JSON.stringify(moves)}`),
      onStockSettled: () => events.push('settled'),
    };
  }

  function repository(answer: SubmitResult): GameRepository {
    return {
      load: () => Promise.resolve(state),
      submit: () => Promise.resolve(answer),
      subscribe: () => () => undefined,
    };
  }

  it('previewsTheMovesAndSettlesAfterTheSave', async () => {
    const storeHooks = depotHooks();
    const saved = { ...state, revision: 1 };
    const store = await GameStore.open(
      herbGardenCatalog,
      repository({ ok: true, state: saved }),
      storeHooks,
    );
    expect(store.dispatch(plant)).toBeNull();
    expect(storeHooks.events).toEqual(['preview:[{"itemId":"sem","delta":-1,"mode":"strict"}]']);
    await store.whenSynced();
    expect(storeHooks.events.at(-1)).toBe('settled');
  });

  it('rollsTheDepotPreviewBackWhenTheServerRefuses', async () => {
    const storeHooks = depotHooks();
    const refused: SubmitResult = { ok: false, reason: 'refused', error: 'no_seed' };
    const store = await GameStore.open(herbGardenCatalog, repository(refused), storeHooks);
    store.dispatch(plant);
    await store.whenSynced();
    expect(storeHooks.refused).toEqual(['no_seed']);
    expect(store.current.garden.plots).toEqual({});
    expect(storeHooks.events.at(-1)).toBe('settled');
  });

  it('leavesTheDepotAloneForOtherCommands', async () => {
    const storeHooks = depotHooks();
    const store = await GameStore.open(
      herbGardenCatalog,
      repository({ ok: true, state: { ...state, revision: 1 } }),
      storeHooks,
    );
    store.dispatch({ type: 'advance_days', days: 1 });
    await store.whenSynced();
    expect(storeHooks.events).toEqual([]);
  });
});
