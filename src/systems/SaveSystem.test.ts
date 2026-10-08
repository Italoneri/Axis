import { describe, expect, it } from 'vitest';
import { createInitialState, parseSave, serializeState } from './SaveSystem';
import { makeState, testCatalog } from './testFixtures';

describe('createInitialState', () => {
  it('starts on day 1 with the initial resources from the catalog', () => {
    expect(createInitialState(testCatalog)).toEqual(
      makeState({ resources: { gold: 100, arcana: 0 } }),
    );
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
      log: [{ day: 5, kind: 'build_started', buildingId: 'forge', level: 1, actor: 'Thorin' }],
    });
    expect(parseSave(serializeState(state), testCatalog)).toEqual({ ok: true, state });
  });

  it.each([
    { name: 'malformed JSON', text: '{oops', error: /invalid JSON/ },
    { name: 'wrong shape', text: '{"version":1}', error: /day/ },
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
  ])('rejects $name', ({ text, error }) => {
    const result = parseSave(text, testCatalog);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });
});
