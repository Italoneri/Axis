import { jobEffectText, t, type TextContext } from '../i18n/pt-BR';
import type { GameState, Npc } from '../model/schema';
import {
  housingCapacity,
  postsAt,
  residentsOf,
  skillOf,
  workersAt,
  yieldTenths,
  type Post,
} from '../systems/Npcs';
import type { GameStore } from '../store';
import { el } from './dom';
import { textContext } from './format';
import { button, field, selectInput } from './widgets';

/** Residents and work posts of a slot, for the building side panel. */
export function renderSlotNpcs(store: GameStore, slotId: string): HTMLElement[] {
  const { catalog, current: state } = store;
  const ctx = textContext(catalog, state);
  const capacity = housingCapacity(state, catalog, slotId);
  const posts = postsAt(state, catalog, slotId);
  return [
    ...(capacity > 0 ? [residentsCard(state, slotId, capacity)] : []),
    ...posts.map((post) => postCard(store, post, ctx)),
  ];
}

function residentsCard(state: GameState, slotId: string, capacity: number): HTMLElement {
  const residents = residentsOf(state, slotId);
  return el(
    'section',
    { class: 'card' },
    el('h3', { class: 'section-title' }, t.npcs.residents(residents.length, capacity)),
    residents.length > 0 &&
      el('ul', { class: 'effects' }, ...residents.map((npc) => el('li', {}, npc.name))),
  );
}

function postCard(store: GameStore, post: Post, ctx: TextContext): HTMLElement {
  const { catalog, current: state } = store;
  const workers = workersAt(state, post);
  const skill = catalog.skills.find((s) => s.id === post.job.skill);
  const isFull = workers.length >= post.job.slots;
  return el(
    'section',
    { class: 'card npc-post' },
    el(
      'h3',
      { class: 'section-title' },
      `${post.job.name} · ${skill?.icon ?? ''} ${skill?.name ?? ''}`,
    ),
    el('p', { class: 'card__sub' }, t.npcs.slotsUsed(workers.length, post.job.slots)),
    workers.length > 0 &&
      el(
        'ul',
        { class: 'effects' },
        ...workers.map((npc) =>
          el(
            'li',
            { class: 'row row--wrap' },
            el('span', {}, t.npcs.preview(npc.name, preview(post, npc, ctx))),
            button(t.npcs.unassign, () => store.dispatch({ type: 'npc_unassign', npcId: npc.id })),
          ),
        ),
      ),
    !isFull && assignForm(store, post, ctx),
  );
}

/** NPC picker sorted by the post's skill, with the yield each one would give. */
function assignForm(store: GameStore, post: Post, ctx: TextContext): HTMLElement {
  const state = store.current;
  const candidates = state.npcs
    .filter((npc) => npc.home !== null && !isAt(npc, post))
    .sort((a, b) => skillOf(b, post.job.skill) - skillOf(a, post.job.skill));
  if (candidates.length === 0) return el('p', { class: 'panel__hint' }, t.npcs.noCandidates);

  const npcSelect = selectInput({
    label: t.npcs.chooseNpc,
    value: candidates[0]?.id ?? '',
    options: candidates.map((npc) => ({
      value: npc.id,
      label: candidateLabel(state, post, npc, ctx),
    })),
  });
  const research = researchSelect(state, post);
  if (research === null) return el('p', { class: 'panel__hint' }, t.npcs.noResearch);

  const assign = () =>
    store.dispatch({
      type: 'npc_assign_job',
      npcId: npcSelect.value,
      slotId: post.slotId,
      activityId: post.job.activity,
      ...(research ? { researchId: research.value } : {}),
    });
  return el(
    'div',
    { class: 'row row--wrap' },
    field(t.npcs.chooseNpc, npcSelect),
    research && field(t.npcs.chooseResearch, research),
    button(t.npcs.assign, assign, { primary: true }),
  );
}

/** Undefined for posts without a target; null when a research post has nothing to work on. */
function researchSelect(state: GameState, post: Post): HTMLSelectElement | null | undefined {
  if (post.job.effect.type !== 'research') return undefined;
  const open = state.research.entries.filter((r) => r.status === 'em_andamento');
  if (open.length === 0) return null;
  return selectInput({
    label: t.npcs.chooseResearch,
    value: open[0]?.id ?? '',
    options: open.map((r) => ({ value: r.id, label: `${r.title} (${r.progress}%)` })),
  });
}

/** "Bia (10) · +3,0 … · posto atual: Biblioteca · Ferido", so moves and absences show up front. */
function candidateLabel(state: GameState, post: Post, npc: Npc, ctx: TextContext): string {
  const away = npc.status === 'ferido' || npc.status === 'em_missao';
  const workplace = npc.job && state.slots[npc.job.slotId]?.buildingId;
  return [
    `${npc.name} (${skillOf(npc, post.job.skill)})`,
    preview(post, npc, ctx),
    workplace && t.npcs.currentPost(ctx.building(workplace)),
    away && t.npcs.statuses[npc.status],
  ]
    .filter(Boolean)
    .join(' · ');
}

function preview(post: Post, npc: Npc, ctx: TextContext): string {
  const { effect } = post.job;
  const tenths =
    effect.type === 'bonus' ? 0 : yieldTenths(effect.perDay, skillOf(npc, post.job.skill));
  return jobEffectText(effect, tenths, ctx);
}

function isAt(npc: Npc, post: Post): boolean {
  return npc.job?.slotId === post.slotId && npc.job.activityId === post.job.activity;
}
