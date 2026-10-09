import { describe, expect, it } from 'vitest';
import { createInitialState, parseSave, serializeState } from './SaveSystem';
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
        { day: 6, kind: 'influence_changed', world: 'Valdren', from: 30, to: 42 },
      ],
    });
    expect(parseSave(serializeState(state), testCatalog)).toEqual({ ok: true, state });
  });

  it('flags saves from an older format as outdated', () => {
    expect(parseSave('{"version":1,"day":3}', testCatalog)).toMatchObject({
      ok: false,
      outdated: true,
    });
  });

  it.each([
    { name: 'malformed JSON', text: '{oops', error: /invalid JSON/ },
    { name: 'wrong shape', text: '{"version":3}', error: /day/ },
    {
      name: 'unknown building',
      text: JSON.stringify(
        makeState({ slots: { core: { buildingId: 'castle', level: 1, status: 'done' } } }),
      ),
      error: /unknown building "castle"/,
    },
    {
      name: 'unknown slot',
      text: JSON.stringify(
        makeState({ slots: { moon: { buildingId: 'forge', level: 1, status: 'done' } } }),
      ),
      error: /unknown slot "moon"/,
    },
    {
      name: 'unknown currency',
      text: JSON.stringify(
        makeState({ wallets: { camp: { ruby: 1 }, characters: { thorin: {} } } }),
      ),
      error: /unknown currency "ruby"/,
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
});
