import { describe, expect, it } from 'vitest';
import { makeState, npc } from '../systems/testFixtures';
import { initials, workerNamesBySlot } from './WorkerBadges';

describe('workerNamesBySlot', () => {
  it('counts only NPCs on duty', () => {
    const job = { slotId: 'outer_n', activityId: 'forjar', carry: 0 };
    const state = makeState({
      npcs: [
        npc({ id: 'a', name: 'Ana', job, status: 'trabalhando' }),
        npc({ id: 'b', name: 'Bia', job, status: 'ferido' }),
        npc({ id: 'c', name: 'Caio', job, status: 'em_missao' }),
        npc({ id: 'd', name: 'Duda', job: null, status: 'disponivel' }),
      ],
    });
    expect(workerNamesBySlot(state)).toEqual(new Map([['outer_n', ['Ana']]]));
  });
});

describe('initials', () => {
  it.each([
    { names: [], text: '' },
    { names: ['bia', 'Gus'], text: 'B·G' },
    { names: ['A', 'B', 'C', 'D', 'E'], text: 'A·B·C +2' },
  ])('turns $names into "$text"', ({ names, text }) => {
    expect(initials(names)).toBe(text);
  });
});
