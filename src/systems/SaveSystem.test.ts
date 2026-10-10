import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialState,
  loadState,
  parseSave,
  serializeState,
  STORAGE_KEY,
} from './SaveSystem';
import { makeState, testCatalog } from './testFixtures';

describe('createInitialState', () => {
  it('starts on day 1 with the seeded wallets, materials, research and influence', () => {
    expect(createInitialState(testCatalog)).toEqual(makeState());
  });
});

describe('parseSave', () => {
  it('round-trips a serialized state', () => {
    const state = makeState({
      day: 7,
      slots: {
        outer_n: {
          buildingId: 'forge',
          level: 1,
          status: 'building',
          startedOnDay: 5,
          completesOnDay: 8,
        },
      },
      log: [
        { day: 5, kind: 'build_started', buildingId: 'forge', level: 1, actor: 'Thorin' },
        { day: 6, kind: 'coins_deposited', character: 'Thorin', coins: { gold: 3 } },
        { day: 6, kind: 'influence_changed', world: 'Mundo Humano', from: 30, to: 42, total: 21 },
      ],
    });
    expect(parseSave(serializeState(state), testCatalog)).toEqual({ ok: true, state });
  });

  it('flags a save with the old influence format (version 3) as outdated', () => {
    const old = { ...makeState(), version: 3, influence: { total: 10, worlds: [] } };
    expect(parseSave(JSON.stringify(old), testCatalog)).toMatchObject({
      ok: false,
      outdated: true,
    });
  });

  it('flags saves from an older format as outdated', () => {
    expect(parseSave('{"version":1,"day":3}', testCatalog)).toMatchObject({
      ok: false,
      outdated: true,
    });
  });

  it.each([
    { name: 'malformed JSON', text: '{oops', error: /invalid JSON/ },
    { name: 'wrong shape', text: '{"version":4}', error: /day/ },
    {
      name: 'unknown building',
      text: JSON.stringify(
        makeState({ slots: { core: { buildingId: 'castle', level: 1, status: 'done' } } }),
      ),
      error: /unknown building "castle"/,
    },
    {
      name: 'unknown currency',
      text: JSON.stringify(
        makeState({ wallets: { camp: { ruby: 1 }, characters: { thorin: {} } } }),
      ),
      error: /unknown currency "ruby"/,
    },
    {
      name: 'unknown world',
      text: JSON.stringify(makeState({ influence: { human: 0, valdren: 40 } })),
      error: /influence of unknown world "valdren"/,
    },
    {
      name: 'character without wallet',
      text: JSON.stringify(makeState({ wallets: { camp: {}, characters: {} } })),
      error: /character "thorin" has no wallet/,
    },
  ])('rejects $name', ({ text, error }) => {
    const result = parseSave(text, testCatalog);
    expect(result).toMatchObject({ ok: false, outdated: false });
    if (!result.ok) expect(result.error).toMatch(error);
  });

  it('drops a building whose slot left the layout, logging it, and keeps the rest', () => {
    const kept = { buildingId: 'forge', level: 1, status: 'done' } as const;
    const save = makeState({
      day: 4,
      slots: { outer_n: kept, mid_9: { buildingId: 'forge', level: 2, status: 'done' } },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseSave(JSON.stringify(save), testCatalog)).toEqual({
      ok: true,
      state: {
        ...save,
        slots: { outer_n: kept },
        log: [{ day: 4, kind: 'building_dropped', buildingId: 'forge', level: 2 }],
      },
    });
    vi.restoreAllMocks();
  });

  // Hand-edited or imported saves: a bad number must never reach the top bar.
  it.each([
    { name: 'a coin count as text', camp: { gold: '11' } },
    { name: 'a negative coin count', camp: { gold: -5 } },
    { name: 'a fractional coin count', camp: { gold: 1.5 } },
    { name: 'a NaN coin count (saved as null)', camp: { gold: NaN } },
  ])('rejects $name', ({ camp }) => {
    const save = { ...makeState(), wallets: { camp, characters: { thorin: {} } } };
    const result = parseSave(JSON.stringify(save), testCatalog);
    expect(result).toMatchObject({ ok: false, outdated: false });
    if (!result.ok) expect(result.error).toMatch(/wallets\.camp\.gold/);
  });

  it.each([
    { name: 'a material quantity as text', quantity: '173' },
    { name: 'a negative material quantity', quantity: -1 },
  ])('rejects $name', ({ quantity }) => {
    const state = makeState();
    const items = state.materials.items.map((m) => ({ ...m, quantity }));
    const save = { ...state, materials: { ...state.materials, items } };
    expect(parseSave(JSON.stringify(save), testCatalog)).toMatchObject({ ok: false });
  });

  it.each([
    { name: 'influence above 100%', human: 150 },
    { name: 'influence as text', human: '40' },
  ])('rejects $name', ({ human }) => {
    const save = { ...makeState(), influence: { human, draconic: 0 } };
    expect(parseSave(JSON.stringify(save), testCatalog)).toMatchObject({ ok: false });
  });
});

describe('loadState', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loads a valid stored save as it is', () => {
    const state = makeState({ day: 9 });
    const storage = memoryStorage({ [STORAGE_KEY]: serializeState(state) });
    expect(loadState(storage, testCatalog)).toEqual(state);
  });

  it('starts fresh when nothing is stored', () => {
    expect(loadState(memoryStorage(), testCatalog)).toEqual(createInitialState(testCatalog));
  });

  it('drops an outdated save and starts fresh', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"version":1,"day":3}' });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(loadState(storage, testCatalog)).toEqual(createInitialState(testCatalog));
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps an invalid save aside for recovery and never shows its values', () => {
    const broken = JSON.stringify({ ...makeState(), wallets: { camp: { gold: '1111' } } });
    const storage = memoryStorage({ [STORAGE_KEY]: broken });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(loadState(storage, testCatalog)).toEqual(createInitialState(testCatalog));
    expect(storage.getItem(`${STORAGE_KEY}:corrupted`)).toBe(broken);
    expect(logged).toHaveBeenCalled();
  });
});

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}
