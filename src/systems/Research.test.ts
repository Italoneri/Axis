import { describe, expect, it } from 'vitest';
import type { GameState, PlacedBuilding, Research } from '../model/schema';
import {
  addResearch,
  completeResearch,
  filterResearch,
  hasResearchArchive,
  removeResearch,
  researchCounts,
  updateResearch,
  type ResearchDraft,
  type ResearchFilter,
} from './Research';
import { makeState } from './testFixtures';

const draft: ResearchDraft = {
  title: 'Lâminas Rúnicas',
  category: 'arcana',
  status: 'em_andamento',
  progress: 20,
  description: 'Gravar runas.',
  notes: '',
};

function withDraft(state: GameState = makeState({ day: 15 })): GameState {
  const result = addResearch(state, 'res_1', draft);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('addResearch', () => {
  it('adds an entry with the given id and logs it', () => {
    const state = withDraft();
    expect(state.research.entries).toEqual([{ ...draft, id: 'res_1' }]);
    expect(state.log).toEqual([{ day: 15, kind: 'research_added', title: 'Lâminas Rúnicas' }]);
  });

  it('refuses a repeated title or an unknown category', () => {
    expect(addResearch(withDraft(), 'res_2', draft)).toEqual({
      ok: false,
      error: 'duplicate_name',
    });
    expect(addResearch(withDraft(), 'res_1', { ...draft, title: 'Outra' })).toEqual({
      ok: false,
      error: 'duplicate_id',
    });
    expect(addResearch(makeState(), 'res_2', { ...draft, category: 'x' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('updateResearch', () => {
  it('logs progress changes', () => {
    const result = updateResearch(withDraft(), 'res_1', { ...draft, progress: 60 });
    expect(result.ok && result.state.log.at(-1)).toEqual({
      day: 15,
      kind: 'research_progressed',
      title: 'Lâminas Rúnicas',
      from: 20,
      to: 60,
    });
  });

  it('logs completion, also through the quick action, with the current day', () => {
    const result = completeResearch(withDraft(), 'res_1');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.research.entries[0]).toEqual({
      id: 'res_1',
      title: 'Lâminas Rúnicas',
      category: 'arcana',
      status: 'concluida',
      completedOnDay: 15,
      description: 'Gravar runas.',
      notes: '',
    });
    expect(result.state.log.at(-1)).toEqual({
      day: 15,
      kind: 'research_completed',
      title: 'Lâminas Rúnicas',
    });
  });
});

describe('removeResearch', () => {
  it('removes and logs', () => {
    const result = removeResearch(withDraft(), 'res_1');
    expect(result.ok && result.state.research.entries).toEqual([]);
    expect(result.ok && result.state.log.at(-1)).toMatchObject({ kind: 'research_removed' });
  });
});

describe('queries', () => {
  const entries: Research[] = [
    { ...draft, id: 'a' },
    {
      id: 'b',
      title: 'História de Nyx',
      category: 'historia',
      status: 'concluida',
      description: '',
      notes: '',
    },
  ];

  it.each<{ filter: ResearchFilter; ids: string[] }>([
    { filter: { status: 'all', category: 'all', query: '' }, ids: ['a', 'b'] },
    { filter: { status: 'concluida', category: 'all', query: '' }, ids: ['b'] },
    { filter: { status: 'all', category: 'arcana', query: '' }, ids: ['a'] },
    { filter: { status: 'all', category: 'all', query: 'historia' }, ids: ['b'] },
    { filter: { status: 'all', category: 'all', query: 'RUNICAS' }, ids: ['a'] },
  ])('filters by $filter', ({ filter, ids }) => {
    expect(filterResearch(entries, filter).map((r) => r.id)).toEqual(ids);
  });

  it('counts done and in-progress entries', () => {
    expect(researchCounts({ categories: [], entries })).toEqual({ done: 1, inProgress: 1 });
  });

  it('opens the archive only once the study station is finished', () => {
    const building: PlacedBuilding = {
      buildingId: 'study_station',
      level: 1,
      status: 'building',
      startedOnDay: 1,
      completesOnDay: 3,
    };
    const done: PlacedBuilding = { buildingId: 'study_station', level: 1, status: 'done' };
    expect(hasResearchArchive(makeState({ slots: { a: building } }))).toBe(false);
    expect(hasResearchArchive(makeState({ slots: { a: done } }))).toBe(true);
  });
});
