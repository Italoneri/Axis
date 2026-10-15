import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand';
import type { CommandContext } from '../commands/schema';
import { gameData } from '../data/gameData';
import { blockReasonText, t } from '../i18n/pt-BR';
import type { GameState, PlacedBuilding } from '../model/schema';
import { buildingLabel, textContext } from '../ui/format';
import { activeBonuses } from './BonusSystem';
import { checkBuild } from './BuildSystem';
import { housingList } from './Npcs';
import { makeState, npc } from './testFixtures';

// Up to 4 Alojamentos stand in the Axis (`maxCount` in buildings.json); every
// other building stays unique. Runs on the shipped data, which has 14 outer slots.

const master: CommandContext = { actor: { role: 'master' } };
const barracks = (level: number, status: 'done' | 'building' = 'done'): PlacedBuilding =>
  status === 'done'
    ? { buildingId: 'barracks', level, status }
    : { buildingId: 'barracks', level, status, startedOnDay: 1, completesOnDay: 3 };

function withBarracks(slots: Record<string, PlacedBuilding>, extra: Partial<GameState> = {}) {
  return makeState({ wallets: { camp: {}, characters: { thorin: {} } }, slots, ...extra });
}

function limitReason(state: GameState, slotId: string, buildingId = 'barracks') {
  const check = checkBuild(state, gameData, { slotId, buildingId });
  return check.ok ? undefined : check.reasons.find((r) => r.kind === 'already_built');
}

function run(state: GameState, command: unknown) {
  const result = applyCommand(state, gameData, command, master);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('several Alojamentos', () => {
  it.each([
    { built: 1, next: 'outer_2' },
    { built: 2, next: 'outer_3' },
    { built: 3, next: 'outer_4' },
  ])('lets a party with $built build one more', ({ built, next }) => {
    const slots = Object.fromEntries(
      ['outer_1', 'outer_2', 'outer_3'].slice(0, built).map((id) => [id, barracks(1)]),
    );
    expect(limitReason(withBarracks(slots), next)).toBeUndefined();
  });

  it('refuses a 5th, counting the ones still under construction', () => {
    const state = withBarracks({
      outer_1: barracks(1),
      outer_2: barracks(2),
      outer_3: barracks(1),
      outer_4: barracks(1, 'building'),
    });
    const reason = limitReason(state, 'outer_5');
    expect(reason).toEqual({ kind: 'already_built', buildingId: 'barracks', maxCount: 4 });
    if (!reason) throw new Error('expected a reason');
    expect(blockReasonText(reason, textContext(gameData, state))).toBe(
      'Limite de 4 Alojamentos na Axis.',
    );
  });

  it('keeps every other building unique', () => {
    const state = withBarracks({ outer_1: { buildingId: 'forge', level: 1, status: 'done' } });
    const reason = limitReason(state, 'outer_2', 'forge');
    expect(reason).toMatchObject({ maxCount: 1 });
    if (!reason) throw new Error('expected a reason');
    expect(blockReasonText(reason, textContext(gameData, state))).toBe('Já existe na Axis.');
  });

  it('adds up the capacity of each one, with NPCs living in more than one', () => {
    const state = withBarracks(
      { outer_1: barracks(2), outer_5: barracks(2) },
      {
        npcs: [
          npc({ id: 'ana', name: 'Ana', home: 'outer_1' }),
          npc({ id: 'bia', name: 'Bia', home: 'outer_5' }),
        ],
      },
    );
    const homes = housingList(state, gameData);
    expect(homes.map((h) => [h.slotId, h.residents, h.capacity])).toEqual([
      ['outer_1', 1, 14],
      ['outer_5', 1, 14],
    ]);
    const moved = run(state, { type: 'npc_set_home', npcId: 'ana', slotId: 'outer_5' });
    expect(housingList(moved, gameData).map((h) => h.residents)).toEqual([0, 2]);
  });

  it('frees only the residents of the Alojamento that is removed', () => {
    const state = withBarracks(
      { outer_1: barracks(1), outer_5: barracks(1) },
      {
        npcs: [
          npc({ id: 'ana', name: 'Ana', home: 'outer_1' }),
          npc({ id: 'bia', name: 'Bia', home: 'outer_5' }),
        ],
      },
    );
    const removed = run(state, { type: 'remove_building', slotId: 'outer_1' });
    expect(removed.npcs.map((n) => [n.id, n.home])).toEqual([
      ['ana', null],
      ['bia', 'outer_5'],
    ]);
  });

  it('shows the bonus once, at the highest level, with how many there are', () => {
    const state = withBarracks({
      outer_1: barracks(1),
      outer_2: barracks(2),
      outer_3: barracks(1, 'building'),
    });
    const bonus = activeBonuses(state, gameData).find((b) => b.buildingId === 'barracks');
    // Shipped texts are still unwritten, so nothing to list yet.
    expect(bonus).toMatchObject({ level: 2, count: 2, party: [], axis: [] });
    expect(t.drawer.copies(2, 'Alojamento')).toBe('(2 Alojamentos)');
  });

  it('names each copy by its slot, so names never change when others come or go', () => {
    expect(buildingLabel(gameData, 'barracks', 'outer_1')).toBe('Alojamento I');
    expect(buildingLabel(gameData, 'barracks', 'outer_4')).toBe('Alojamento IV');
    // outer_11 and outer_12 do not exist (the reserved stretch): outer_13 is the 11th outer slot.
    expect(buildingLabel(gameData, 'barracks', 'outer_13')).toBe('Alojamento XI');
    expect(buildingLabel(gameData, 'forge', 'outer_4')).toBe('Forja');

    const before = withBarracks({ outer_2: barracks(1), outer_9: barracks(1) });
    const after = run(before, { type: 'remove_building', slotId: 'outer_2' });
    const label = (state: GameState) =>
      Object.keys(state.slots).map((slotId) => buildingLabel(gameData, 'barracks', slotId));
    expect(label(before)).toEqual(['Alojamento II', 'Alojamento IX']);
    expect(label(after)).toEqual(['Alojamento IX']);
  });

  it('logs which Alojamento is built, upgraded or forced', () => {
    const state = run(withBarracks({}), {
      type: 'force_building',
      slotId: 'outer_3',
      buildingId: 'barracks',
      level: 1,
    });
    expect(state.log.at(-1)).toMatchObject({ kind: 'building_forced', slotId: 'outer_3' });
  });

  it('lets the master force up to the limit, and change the level of one already there', () => {
    const full = withBarracks({
      outer_1: barracks(1),
      outer_2: barracks(1),
      outer_3: barracks(1),
      outer_4: barracks(1),
    });
    const force = (slotId: string, level: number) =>
      applyCommand(
        full,
        gameData,
        { type: 'force_building', slotId, buildingId: 'barracks', level },
        master,
      );
    expect(force('outer_5', 1)).toEqual({ ok: false, error: 'building_limit' });
    expect(force('outer_2', 3).ok).toBe(true);
  });

  it('marks a full Alojamento in the home picker', () => {
    expect(t.npcs.homeOption('Alojamento I', 3, 14)).toBe('Alojamento I (3/14)');
    expect(t.npcs.homeOption('Alojamento II', 14, 14)).toBe('Alojamento II (14/14, lotado)');
  });
});
