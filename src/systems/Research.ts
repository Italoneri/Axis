import type { GameState, LogEntry, Research, ResearchBook, ResearchStatus } from '../model/schema';
import { builtLevel } from './BuildSystem';
import {
  addCategory,
  nameError,
  removeCategory,
  renameCategory,
  uniqueId,
  type CategoriesResult,
} from './Categories';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';

/** Building whose side panel shows the full research archive once built. */
export const STUDY_STATION_ID = 'study_station';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ResearchDraft = DistributiveOmit<Research, 'id'>;

export interface ResearchFilter {
  status: ResearchStatus | 'all';
  category: string | 'all';
  query: string;
}

export function hasResearchArchive(state: GameState): boolean {
  return builtLevel(state, STUDY_STATION_ID) >= 1;
}

export function researchCounts(book: ResearchBook): { done: number; inProgress: number } {
  const done = book.entries.filter((r) => r.status === 'concluida').length;
  return { done, inProgress: book.entries.length - done };
}

export function filterResearch(entries: readonly Research[], filter: ResearchFilter): Research[] {
  const query = normalizeForSearch(filter.query);
  return entries.filter(
    (r) =>
      (filter.status === 'all' || r.status === filter.status) &&
      (filter.category === 'all' || r.category === filter.category) &&
      normalizeForSearch(r.title).includes(query),
  );
}

export function addResearch(state: GameState, draft: ResearchDraft): Outcome {
  const { research } = state;
  const error = draftError(research, draft);
  if (error) return fail(error);
  const id = uniqueId(
    draft.title,
    research.entries.map((r) => r.id),
  );
  const entry: Research = { id, ...draft, title: draft.title.trim() };
  return ok(
    withLog(setResearch(state, { ...research, entries: [...research.entries, entry] }), {
      day: state.day,
      kind: 'research_added',
      title: entry.title,
    }),
  );
}

/** Replaces every field; logs completion and progress changes. */
export function updateResearch(state: GameState, id: string, draft: ResearchDraft): Outcome {
  const { research } = state;
  const previous = research.entries.find((r) => r.id === id);
  if (!previous) return fail('not_found');
  const error = draftError(research, draft, id);
  if (error) return fail(error);
  const next: Research = { id, ...draft, title: draft.title.trim() };
  const entries = research.entries.map((r) => (r.id === id ? next : r));
  return ok(
    withLog(setResearch(state, { ...research, entries }), ...changeLog(state, previous, next)),
  );
}

/** Marks as done today, keeping every other field. */
export function completeResearch(state: GameState, id: string): Outcome {
  const entry = state.research.entries.find((r) => r.id === id);
  if (!entry) return fail('not_found');
  if (entry.status === 'concluida') return ok(state);
  const { title, category, startedOnDay, owner, description, notes, cost } = entry;
  return updateResearch(state, id, {
    ...{ title, category, startedOnDay, owner, description, notes, cost },
    status: 'concluida',
    completedOnDay: state.day,
  });
}

export function removeResearch(state: GameState, id: string): Outcome {
  const { research } = state;
  const entry = research.entries.find((r) => r.id === id);
  if (!entry) return fail('not_found');
  return ok(
    withLog(
      setResearch(state, { ...research, entries: research.entries.filter((r) => r.id !== id) }),
      {
        day: state.day,
        kind: 'research_removed',
        title: entry.title,
      },
    ),
  );
}

export function addResearchCategory(state: GameState, name: string): Outcome {
  return withCategories(state, addCategory(state.research.categories, name));
}

export function renameResearchCategory(state: GameState, id: string, name: string): Outcome {
  return withCategories(state, renameCategory(state.research.categories, id, name));
}

export function removeResearchCategory(state: GameState, id: string): Outcome {
  const isInUse = state.research.entries.some((r) => r.category === id);
  return withCategories(state, removeCategory(state.research.categories, id, isInUse));
}

function changeLog(state: GameState, previous: Research, next: Research): LogEntry[] {
  const title = next.title;
  if (next.status === 'concluida') {
    return previous.status === 'concluida'
      ? []
      : [{ day: state.day, kind: 'research_completed', title }];
  }
  const from = previous.status === 'em_andamento' ? previous.progress : 100;
  return from === next.progress
    ? []
    : [{ day: state.day, kind: 'research_progressed', title, from, to: next.progress }];
}

function draftError(book: ResearchBook, draft: ResearchDraft, ownId?: string): ActionError | null {
  if (!book.categories.some((c) => c.id === draft.category)) return 'not_found';
  return nameError(
    draft.title,
    book.entries.map((r) => ({ id: r.id, name: r.title })),
    ownId,
  );
}

function setResearch(state: GameState, research: ResearchBook): GameState {
  return { ...state, research };
}

function withCategories(state: GameState, result: CategoriesResult): Outcome {
  if (!result.ok) return fail(result.error);
  return ok(setResearch(state, { ...state.research, categories: result.categories }));
}

function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}
