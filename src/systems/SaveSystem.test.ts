import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInitialState,
  loadState,
  migrateSave,
  parseSave,
  parseSaveArchive,
  parseSaveDepot,
  serializeSave,
  serializeState,
  STORAGE_KEY,
} from './SaveSystem';
import { EMPTY_ARCHIVE, type Archive } from './Archive';
import type { Depot } from './Depot';
import { SAVE_VERSION } from '../model/schema';
import { LOG_LIMIT } from './outcome';
import { makeState, memoryStorage, npc, testCatalog } from './testFixtures';

describe('createInitialState', () => {
  it('starts on day 1 with the seeded wallets, materials, research and influence', () => {
    expect(createInitialState(testCatalog)).toEqual(makeState());
  });
});

describe('garden in the save', () => {
  it('startsNewGamesWithAnEmptyGarden', () => {
    expect(createInitialState(testCatalog).garden).toEqual({ crops: [], plots: {} });
  });

  it('migratesVersion8SavesWithEmptyGarden', () => {
    const { garden, ...rest } = makeState();
    expect(garden).toEqual({ crops: [], plots: {} });
    const parsed = parseSave(JSON.stringify({ ...rest, version: 8 }), testCatalog);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.version).toBe(SAVE_VERSION);
    expect(parsed.state.garden).toEqual({ crops: [], plots: {} });
  });
});

describe('shop in the save', () => {
  const seedIds = ['shop_wood', 'shop_iron', 'shop_aetherium'];
  const shopIds = (state: { shop: { items: { id: string }[] } }) =>
    state.shop.items.map((item) => item.id);

  it('seedsTheShopOnNewGames', () => {
    expect(shopIds(createInitialState(testCatalog))).toEqual(seedIds);
  });

  it('migratesVersion7SavesWithSeedShop', () => {
    const { shop, ...rest } = makeState();
    expect(shop.items).toHaveLength(3);
    const parsed = parseSave(JSON.stringify({ ...rest, version: 7 }), testCatalog);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.version).toBe(SAVE_VERSION);
    expect(shopIds(parsed.state)).toEqual(seedIds);
  });

  it('keepsAnExistingShopOnLoad', () => {
    const [first] = testCatalog.seed.shop.items;
    if (!first) throw new Error('no seed shop');
    const custom = { ...first, id: 'shop_custom' };
    const state = makeState({ shop: { items: [custom] } });
    const parsed = parseSave(JSON.stringify(state), testCatalog);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(shopIds(parsed.state)).toEqual(['shop_custom']);
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

  it('keeps only the latest LOG_LIMIT log entries of a long save', () => {
    const log = Array.from({ length: LOG_LIMIT + 5 }, (_, i) => ({
      day: 1,
      kind: 'days_advanced' as const,
      days: i + 1,
    }));
    const parsed = parseSave(serializeState(makeState({ log })), testCatalog);
    expect(parsed.ok && parsed.state.log).toEqual(log.slice(5));
  });

  it('reads a save from before revisions as revision 0', () => {
    const legacy = Object.fromEntries(
      Object.entries(makeState({ day: 4 })).filter(([key]) => key !== 'revision'),
    );
    expect(parseSave(JSON.stringify(legacy), testCatalog)).toEqual({
      ok: true,
      state: makeState({ day: 4 }),
    });
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
        log: [
          {
            day: 4,
            kind: 'building_dropped',
            buildingId: 'forge',
            level: 2,
            reason: 'missing_slot',
          },
        ],
      },
    });
    vi.restoreAllMocks();
  });

  it('drops a building taken out of the game (a Torre de Vigia) and loads the rest', () => {
    const kept = { buildingId: 'forge', level: 1, status: 'done' } as const;
    const save = makeState({
      day: 6,
      slots: { outer_n: kept, outer_e: { buildingId: 'watchtower', level: 2, status: 'done' } },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parsed = parseSave(JSON.stringify(save), testCatalog);
    expect(parsed).toEqual({
      ok: true,
      state: {
        ...save,
        slots: { outer_n: kept },
        log: [
          {
            day: 6,
            kind: 'building_dropped',
            buildingId: 'watchtower',
            level: 2,
            reason: 'unknown_building',
          },
        ],
      },
    });
    expect(warn).toHaveBeenCalledOnce();
    vi.restoreAllMocks();

    // Exporting and importing the loaded game gives it back as it is.
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parseSave(serializeState(parsed.state), testCatalog)).toEqual(parsed);
  });

  it('keeps a save without unknown buildings exactly as it was', () => {
    const save = makeState({
      slots: { outer_n: { buildingId: 'forge', level: 1, status: 'done' } },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseSave(JSON.stringify(save), testCatalog)).toEqual({ ok: true, state: save });
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('frees the NPCs that worked in a dropped building', () => {
    const save = makeState({
      slots: {
        outer_n: { buildingId: 'study_station', level: 1, status: 'done' },
        outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
      },
      npcs: [
        npc({
          id: 'lia',
          name: 'Lia',
          home: 'outer_e',
          job: { slotId: 'outer_n', activityId: 'estudar', carry: 0 },
          status: 'trabalhando',
        }),
      ],
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parsed = parseSave(JSON.stringify(save), testCatalog);
    vi.restoreAllMocks();
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.state.npcs[0]).toMatchObject({
      home: 'outer_e',
      job: null,
      status: 'disponivel',
    });
  });

  // Negative skills only widened the fields: v5 saves from before them stay valid as they are.
  it.each([
    { name: 'a v5 save with only positive skills', skill: 7, carry: 4, amount: 3 },
    { name: 'a save with negative skills', skill: -6, carry: -2, amount: -3 },
  ])('reads $name without a version bump', ({ skill, carry, amount }) => {
    const state = makeState({
      slots: {
        outer_n: { buildingId: 'forge', level: 1, status: 'done' },
        outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
      },
      npcs: [
        npc({
          id: 'bianca',
          name: 'Bianca',
          skills: { smithing: skill },
          home: 'outer_e',
          job: { slotId: 'outer_n', activityId: 'forjar', carry },
          status: 'trabalhando',
        }),
      ],
      log: [
        { day: 1, kind: 'npc_worked', npc: 'Bianca', effect: 'produce', amount, target: 'Ferro' },
      ],
    });
    const parsed = parseSave(serializeState(state), testCatalog);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed).toEqual({ ok: true, state });
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

describe('migrateSave', () => {
  const v4 = { version: 4, day: 2 };

  it('runs every step up to the target version', () => {
    const migrations = {
      4: (save: Record<string, unknown>) => ({ ...save, npcs: [] }),
      5: (save: Record<string, unknown>) => ({ ...save, day: 3 }),
    };
    expect(migrateSave(v4, migrations, 6)).toEqual({
      ok: true,
      json: { version: 6, day: 3, npcs: [] },
      from: 4,
    });
  });

  it('gives a version 4 save an empty npc list, keeping everything else', () => {
    const { npcs, ...rest } = makeState({ day: 9 });
    expect(npcs).toEqual([]);
    const parsed = parseSave(JSON.stringify({ ...rest, version: 4 }), testCatalog);
    expect(parsed).toEqual({ ok: true, state: makeState({ day: 9 }) });
  });

  it('gives a version 6 save an empty mission board, keeping everything else', () => {
    const { missions, ...rest } = makeState({ day: 9, npcs: [npc({ id: 'bia', name: 'Bia' })] });
    expect(missions).toEqual([]);
    const parsed = parseSave(JSON.stringify({ ...rest, version: 6 }), testCatalog);
    expect(parsed).toEqual({
      ok: true,
      state: makeState({ day: 9, npcs: [npc({ id: 'bia', name: 'Bia' })] }),
    });
  });

  it('leaves a current save untouched', () => {
    expect(migrateSave(v4, {}, 4)).toEqual({ ok: true, json: v4, from: 4 });
  });

  it('refuses a gap in the chain (kept) and saves older than the oldest supported (outdated)', () => {
    expect(migrateSave(v4, {}, 5)).toEqual({
      ok: false,
      error: 'no migration from save version 4',
      outdated: false,
    });
    expect(migrateSave({ version: 3 }, {}, 4)).toEqual({
      ok: false,
      error: 'save version 3',
      outdated: true,
    });
  });
});

describe('version 5 saves: housing only in the Alojamento', () => {
  // outer_n holds a Forja, which offers no housing, like the old Taverna homes.
  const slots = {
    outer_n: { buildingId: 'forge', level: 1, status: 'done' },
    outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
  } as const;
  const forjar = { slotId: 'outer_n', activityId: 'forjar', carry: 3 };
  const pele = npc({
    id: 'pele',
    name: 'Pelé',
    home: 'outer_n',
    job: forjar,
    status: 'trabalhando',
  });
  const ana = npc({ id: 'ana', name: 'Ana', home: 'outer_n' });

  function load(version: number, npcs: ReturnType<typeof npc>[]) {
    const parsed = parseSave(
      JSON.stringify({ ...makeState({ slots, npcs }), version }),
      testCatalog,
    );
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.state;
  }

  it('moves residents to the Alojamento when there is room, keeping their post', () => {
    const state = load(5, [pele]);
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.npcs[0]).toMatchObject({ home: 'outer_e', job: forjar, status: 'trabalhando' });
    expect(state.log).toEqual([
      { day: 1, kind: 'npc_moved', npc: 'Pelé', from: 'forge', place: 'barracks' },
    ]);
  });

  it('releases, in list order, whoever does not fit', () => {
    const resident = npc({ id: 'bia', name: 'Bia', home: 'outer_e' });
    const state = load(5, [resident, pele, ana]);
    expect(state.npcs.map((n) => [n.name, n.home, n.job?.activityId ?? null])).toEqual([
      ['Bia', 'outer_e', null],
      ['Pelé', 'outer_e', 'forjar'],
      ['Ana', null, null],
    ]);
    expect(state.log.map((entry) => entry.kind)).toEqual(['npc_moved', 'npc_released']);
    expect(state.log[1]).toMatchObject({ npc: 'Ana', from: 'home', reason: 'capacity' });
  });

  it('runs only on the upgrade from version 5', () => {
    const state = load(6, [pele]);
    expect(state.npcs[0]).toMatchObject({ home: null, job: null, status: 'disponivel' });
  });
});

describe('save file with the archive', () => {
  const archive: Archive = {
    topics: [{ id: 'npcs', name: 'NPCs', order: 0, authorId: 'mestre', deletedAt: null }],
    notes: [],
  };

  it('exports and imports the archive beside the game', () => {
    const text = serializeSave(makeState({ day: 4 }), archive);
    expect(parseSave(text, testCatalog)).toMatchObject({ ok: true, state: { day: 4 } });
    expect(parseSaveArchive(text)).toEqual({ ok: true, archive });
  });

  it('reads saves without an archive as having none', () => {
    expect(parseSaveArchive(serializeState(makeState()))).toEqual({ ok: true, archive: null });
  });

  it('refuses an invalid archive', () => {
    const text = JSON.stringify({ ...makeState(), archive: { topics: 'x' } });
    expect(parseSaveArchive(text)).toMatchObject({ ok: false });
  });
});

describe('save file with the depot', () => {
  const depot: Depot = {
    sections: [
      { id: 'bau', name: 'Baú', ownerId: 'thorin', order: 0, authorId: 'thorin', deletedAt: null },
    ],
    items: [],
  };

  it('exports and imports the depot beside the game and the archive', () => {
    const text = serializeSave(makeState({ day: 4 }), EMPTY_ARCHIVE, depot);
    expect(parseSave(text, testCatalog)).toMatchObject({ ok: true, state: { day: 4 } });
    expect(parseSaveArchive(text)).toEqual({ ok: true, archive: EMPTY_ARCHIVE });
    expect(parseSaveDepot(text)).toEqual({ ok: true, depot });
  });

  it('reads saves without a depot as having none', () => {
    expect(parseSaveDepot(serializeState(makeState()))).toEqual({ ok: true, depot: null });
  });

  it('refuses an invalid depot', () => {
    const text = JSON.stringify({ ...makeState(), depot: { sections: 'x' } });
    expect(parseSaveDepot(text)).toMatchObject({ ok: false });
  });
});
