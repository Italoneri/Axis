import { describe, expect, it } from 'vitest';
import { gameData } from '../data/gameData';
import { parseState, serializeState } from './SaveSystem';
import { builtLevel, checkBuild, checkUpgrade } from './BuildSystem';
import { makeState } from './testFixtures';

// The Depósito (`armory`) moved from the wall to the middle ring. Saves where it
// already stands on an outer slot keep it there, working and upgradable.

const reasonKinds = (check: ReturnType<typeof checkBuild>) =>
  check.ok ? [] : check.reasons.map((r) => r.kind);

describe('Depósito on the middle ring', () => {
  it('is only offered for middle slots', () => {
    const def = gameData.buildings.find((b) => b.id === 'armory');
    expect(def?.allowedSlots).toEqual(['middle']);
    const state = makeState();
    expect(
      reasonKinds(checkBuild(state, gameData, { slotId: 'mid_1', buildingId: 'armory' })),
    ).not.toContain('wrong_slot_type');
    expect(
      reasonKinds(checkBuild(state, gameData, { slotId: 'outer_1', buildingId: 'armory' })),
    ).toContain('wrong_slot_type');
  });

  it('keeps an armory built on the wall in an older save', () => {
    const state = makeState({
      slots: { outer_1: { buildingId: 'armory', level: 1, status: 'done' } },
    });
    const loaded = parseState(JSON.parse(serializeState(state)), gameData);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.state.slots.outer_1).toEqual({ buildingId: 'armory', level: 1, status: 'done' });
    expect(builtLevel(loaded.state, 'armory')).toBe(1);
    expect(reasonKinds(checkUpgrade(loaded.state, gameData, 'outer_1'))).not.toContain(
      'wrong_slot_type',
    );
  });
});
