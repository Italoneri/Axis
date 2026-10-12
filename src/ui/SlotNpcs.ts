import { jobEffectText, t, type TextContext } from '../i18n/pt-BR';
import type { Catalog } from '../model/catalog';
import type { GameState, Npc } from '../model/schema';
import {
  findPost,
  housingCapacity,
  postsAt,
  residentsOf,
  skillOf,
  postYieldTenths,
  workersAt,
  type Post,
} from '../systems/Npcs';
import type { GameStore } from '../store';
import { el } from './dom';
import { textContext } from './format';
import { button, confirmButton, field, selectInput } from './widgets';

/** Residents and work posts of a slot, for the building side panel. */
export function renderSlotNpcs(store: GameStore, slotId: string): HTMLElement[] {
  const { catalog, current: state } = store;
  const ctx = textContext(catalog, state);
  const capacity = housingCapacity(state, catalog, slotId);
  const posts = postsAt(state, catalog, slotId);
  return [
    ...(capacity > 0 ? [residentsCard(store, slotId, capacity)] : []),
    ...posts.map((post) => postCard(store, post, ctx)),
  ];
}

function residentsCard(store: GameStore, slotId: string, capacity: number): HTMLElement {
  const residents = residentsOf(store.current, slotId);
  return el(
    'section',
    { class: 'card' },
    el('h3', { class: 'section-title' }, t.npcs.residents(residents.length, capacity)),
    residents.length > 0 &&
      el(
        'ul',
        { class: 'effects' },
        ...residents.map((npc) =>
          el(
            'li',
            { class: 'row row--wrap' },
            el('span', {}, npc.name),
            moveOutButton(store, npc, t.npcs.moveOut, () =>
              store.dispatch({ type: 'npc_set_home', npcId: npc.id, slotId: null }),
            ),
          ),
        ),
      ),
  );
}

/**
 * Moves the NPC out of its home. Work needs a home, so for an NPC with a post
 * it asks a second click naming the post it will leave.
 */
export function moveOutButton(
  { catalog, current: state }: Pick<GameStore, 'catalog' | 'current'>,
  npc: Npc,
  label: string,
  onMoveOut: () => void,
): HTMLButtonElement {
  const post = npc.job && findPost(state, catalog, npc.job);
  if (!post) return button(label, onMoveOut);
  const building = textContext(catalog, state).building(post.buildingId);
  return confirmButton(
    label,
    onMoveOut,
    t.npcs.moveOutLeavesPost(npc.name, post.job.name, building),
  );
}

function postCard(store: GameStore, post: Post, ctx: TextContext): HTMLElement {
  const { catalog, current: state } = store;
  const workers = workersAt(state, post);
  const skill = catalog.skills.find((s) => s.id === post.job.skill);
  const isFull = workers.length >= post.slots;
  return el(
    'section',
    { class: 'card npc-post' },
    el(
      'h3',
      { class: 'section-title' },
      `${post.job.name} · ${skill?.icon ?? ''} ${skill?.name ?? ''}`,
    ),
    el('p', { class: 'card__sub' }, t.npcs.slotsUsed(workers.length, post.slots)),
    workers.length > 0 &&
      el(
        'ul',
        { class: 'effects' },
        ...workers.map((npc) =>
          el(
            'li',
            { class: 'row row--wrap' },
            el(
              'span',
              { class: hinders(post, npc) ? 'is-negative' : undefined },
              t.npcs.preview(npc.name, preview(catalog, post, npc, ctx)),
            ),
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
      label: candidateLabel(store, post, npc, ctx),
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

/** "Bia (10) · +3,0 … · posto atual: Biblioteca · Ferido": moves, absences and hindering up front. */
function candidateLabel(store: GameStore, post: Post, npc: Npc, ctx: TextContext): string {
  const { catalog, current: state } = store;
  const away = npc.status === 'ferido' || npc.status === 'em_missao';
  const workplace = npc.job && state.slots[npc.job.slotId]?.buildingId;
  return [
    `${npc.name} (${skillOf(npc, post.job.skill)})`,
    preview(catalog, post, npc, ctx) + (hinders(post, npc) ? ` ${t.npcs.hinders}` : ''),
    workplace && t.npcs.currentPost(ctx.building(workplace)),
    away && t.npcs.statuses[npc.status],
  ]
    .filter(Boolean)
    .join(' · ');
}

function preview(catalog: Catalog, post: Post, npc: Npc, ctx: TextContext): string {
  return jobEffectText(post.job.effect, postYieldTenths(catalog, post, npc), ctx);
}

function hinders(post: Post, npc: Npc): boolean {
  return skillOf(npc, post.job.skill) < 0;
}

function isAt(npc: Npc, post: Post): boolean {
  return npc.job?.slotId === post.slotId && npc.job.activityId === post.job.activity;
}
