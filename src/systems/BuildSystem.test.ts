import { describe, expect, it } from 'vitest';
import type { GameState } from '../model/schema';
import { builtLevel, checkBuild, checkUpgrade, startBuild, startUpgrade } from './BuildSystem';
import { makeState, testCatalog, withCamp, withIron } from './testFixtures';

const forgeDone = { buildingId: 'forge', level: 1, status: 'done' } as const;
const heartDone = { buildingId: 'heart', level: 1, status: 'done' } as const;

function reasonKinds(result: ReturnType<typeof checkBuild>): string[] {
  return result.ok ? [] : result.reasons.map((r) => r.kind);
}

describe('checkBuild', () => {
  it.each<{
    name: string;
    state: GameState;
    slotId: string;
    buildingId: string;
    reasons: string[];
  }>([
    {
      name: 'allows a valid build',
      state: makeState(),
      slotId: 'outer_n',
      buildingId: 'forge',
      reasons: [],
    },
    {
      name: 'rejects the wrong slot type',
      state: makeState(),
      slotId: 'core',
      buildingId: 'forge',
      reasons: ['wrong_slot_type'],
    },
    {
      name: 'rejects an occupied slot',
      state: makeState({ slots: { outer_n: forgeDone } }),
      slotId: 'outer_n',
      buildingId: 'armory',
      reasons: ['slot_occupied', 'missing_materials'],
    },
    {
      name: 'rejects a second copy of the same structure',
      state: makeState({ slots: { outer_n: forgeDone } }),
      slotId: 'outer_s',
      buildingId: 'forge',
      reasons: ['already_built'],
    },
    {
      name: 'rejects a missing prerequisite',
      state: withIron(10),
      slotId: 'outer_n',
      buildingId: 'armory',
      reasons: ['missing_requirement'],
    },
    {
      name: 'rejects insufficient coins in the Acampamento',
      state: withCamp({ gold: 5 }),
      slotId: 'outer_n',
      buildingId: 'forge',
      reasons: ['missing_coins'],
    },
  ])('$name', ({ state, slotId, buildingId, reasons }) => {
    expect(reasonKinds(checkBuild(state, testCatalog, { slotId, buildingId }))).toEqual(reasons);
  });

  it('treats a prerequisite under construction as unmet', () => {
    const state = withIron(10, {
      slots: {
        outer_n: {
          buildingId: 'forge',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 4,
        },
      },
    });
    const result = checkBuild(state, testCatalog, { slotId: 'outer_s', buildingId: 'armory' });
    expect(reasonKinds(result)).toEqual(['missing_requirement']);
  });

  it('reports exactly which materials are missing', () => {
    const result = checkBuild(withIron(2, { slots: { outer_n: forgeDone } }), testCatalog, {
      slotId: 'outer_s',
      buildingId: 'armory',
    });
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'missing_materials', missing: { iron: 3 } }],
    });
  });

  it('reports the coin shortfall and what the characters hold', () => {
    const result = checkBuild(withCamp({ gold: 15 }), testCatalog, {
      slotId: 'outer_n',
      buildingId: 'forge',
    });
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'missing_coins', missingBronze: 500, personalBronze: 500 }],
    });
  });

  it('marks a material missing from the catalog as unavailable instead of crashing', () => {
    const state = makeState({
      slots: { outer_n: forgeDone },
      materials: { categories: [], items: [] },
    });
    const result = checkBuild(state, testCatalog, { slotId: 'outer_s', buildingId: 'armory' });
    expect(result).toEqual({ ok: false, reasons: [{ kind: 'unknown_materials', ids: ['iron'] }] });
  });
});

describe('checkUpgrade', () => {
  it('blocks higher levels until the core requirement is met', () => {
    const state = makeState({ slots: { outer_n: forgeDone } });
    const result = checkUpgrade(state, testCatalog, 'outer_n');
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'missing_requirement', requirement: { building: 'heart', minLevel: 1 } }],
    });
    expect(
      checkUpgrade(
        makeState({ slots: { outer_n: forgeDone, core: heartDone } }),
        testCatalog,
        'outer_n',
      ).ok,
    ).toBe(true);
  });

  it('blocks upgrades while building and at max level', () => {
    const building = makeState({
      slots: {
        core: {
          buildingId: 'heart',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 3,
        },
      },
    });
    expect(reasonKinds(checkUpgrade(building, testCatalog, 'core'))).toEqual([
      'under_construction',
    ]);

    const maxed = makeState({ slots: { core: { buildingId: 'heart', level: 2, status: 'done' } } });
    expect(reasonKinds(checkUpgrade(maxed, testCatalog, 'core'))).toEqual(['max_level']);
  });
});

describe('startBuild', () => {
  it('charges the Acampamento, schedules completion and logs the event', () => {
    const result = startBuild(makeState({ day: 5 }), testCatalog, {
      slotId: 'outer_n',
      buildingId: 'forge',
      actor: 'Thorin',
    });
    expect(result.ok && result.state).toMatchObject({
      wallets: { camp: { gold: 80 }, characters: { thorin: { gold: 5 } } },
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
        {
          day: 5,
          kind: 'build_started',
          buildingId: 'forge',
          level: 1,
          actor: 'Thorin',
          paid: { bronze: 2000, materials: {} },
        },
      ],
    });
  });

  it('pays with bigger coins and consumes the materials', () => {
    const state = withIron(7, { slots: { outer_n: forgeDone } });
    const result = startBuild(
      { ...state, wallets: { ...state.wallets, camp: { emerald: 1 } } },
      testCatalog,
      { slotId: 'outer_s', buildingId: 'armory' },
    );
    if (!result.ok) throw new Error('expected build to start');
    expect(result.state.wallets.camp).toEqual({ platinum: 9 });
    expect(result.state.materials.items[0]?.quantity).toBe(2);
    expect(result.state.log.at(-1)).toMatchObject({
      paid: { bronze: 1000, materials: { Ferro: 5 } },
    });
  });

  it('does not change the state when blocked', () => {
    const state = withCamp({});
    const result = startBuild(state, testCatalog, { slotId: 'outer_n', buildingId: 'forge' });
    expect(result.ok).toBe(false);
    expect(state.slots).toEqual({});
  });
});

describe('startUpgrade', () => {
  it('completes instantly when buildTime is zero and keeps the bonus level active', () => {
    const state = makeState({ slots: { outer_n: forgeDone, core: heartDone } });
    const result = startUpgrade(state, testCatalog, 'outer_n');
    expect(result.ok && result.state.slots['outer_n']).toEqual({
      buildingId: 'forge',
      level: 2,
      status: 'done',
    });
    expect(result.ok && result.state.log.map((e) => e.kind)).toEqual([
      'upgrade_started',
      'build_completed',
    ]);
  });

  it('keeps the previous level active during an upgrade', () => {
    const state = makeState({ slots: { core: heartDone } });
    const result = startUpgrade(state, testCatalog, 'core');
    if (!result.ok) throw new Error('expected upgrade to start');
    expect(builtLevel(result.state, 'heart')).toBe(1);
  });
});
