import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../data/gameData';
import { logEntryText } from '../i18n/pt-BR';
import type { GameState } from '../model/schema';
import { textContext } from '../ui/format';
import { checkBuild } from './BuildSystem';
import { parseSave } from './SaveSystem';
import { makeState, npc } from './testFixtures';

// The Depósito (`armory`) left the wall for the middle ring. Older saves with it
// on an outer slot get it moved to the first free middle slot when they load.

const reasonKinds = (check: ReturnType<typeof checkBuild>) =>
  check.ok ? [] : check.reasons.map((r) => r.kind);

const armory = { buildingId: 'armory', level: 2, status: 'done' } as const;
const middleSlots = gameData.layout.slots.filter((s) => s.type === 'middle').map((s) => s.id);
const [mid1 = '', mid2 = ''] = middleSlots;

function load(state: GameState) {
  const parsed = parseSave(JSON.stringify(state), gameData);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.state;
}

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

  it('moves an armory on the wall to the first free middle slot, with its level', () => {
    const sanctuary = { buildingId: 'sanctuary', level: 1, status: 'done' } as const;
    const loaded = load(makeState({ day: 5, slots: { outer_1: armory, [mid1]: sanctuary } }));
    expect(loaded.slots).toEqual({ [mid1]: sanctuary, [mid2]: armory });
    const entry = loaded.log.at(-1);
    if (!entry) throw new Error('no log entry');
    expect(entry).toEqual({
      day: 5,
      kind: 'building_moved',
      buildingId: 'armory',
      level: 2,
      slotId: mid2,
    });
    expect(logEntryText(entry, textContext(gameData, loaded))).toBe(
      'Dia 5 — Depósito nv. 2 mudou de lugar: o espaço antigo não aceita mais essa construção',
    );
    // Loading it again changes nothing.
    expect(load(loaded)).toEqual(loaded);
  });

  it('takes the NPCs living or working there along', () => {
    const worker = npc({
      id: 'ana',
      name: 'Ana',
      home: 'outer_1',
      job: { slotId: 'outer_1', activityId: 'x', carry: 0 },
    });
    const loaded = parseSave(
      JSON.stringify(makeState({ slots: { outer_1: armory }, npcs: [worker] })),
      gameData,
    );
    if (!loaded.ok) throw new Error(loaded.error);
    expect(loaded.state.slots[mid1]).toEqual(armory);
    // The Depósito has neither housing nor posts, so the move hands it over and settling frees it.
    expect(loaded.state.npcs[0]).toMatchObject({ home: null, job: null });
  });

  it('removes it when every middle slot is taken', () => {
    const others = gameData.buildings.filter(
      (b) => b.allowedSlots.includes('middle') && b.id !== 'armory',
    );
    const slots = Object.fromEntries(
      middleSlots.map((slotId, i) => [
        slotId,
        { buildingId: others[i % others.length]?.id ?? '', level: 1, status: 'done' as const },
      ]),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loaded = load(makeState({ slots: { ...slots, outer_1: armory } }));
    vi.restoreAllMocks();
    expect(loaded.slots.outer_1).toBeUndefined();
    expect(loaded.log.at(-1)).toMatchObject({
      kind: 'building_dropped',
      buildingId: 'armory',
      reason: 'wrong_slot',
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
