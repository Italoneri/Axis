import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import { goldInBronze, type Catalog } from '../../model/catalog';
import {
  MAX_ATTRIBUTE,
  MAX_SKILL,
  MIN_ATTRIBUTE,
  MIN_SKILL,
  type GameState,
  type Npc,
  type NpcStatus,
} from '../../model/schema';
import {
  bronzeToGold,
  fromBronze,
  goldToBronze,
  toBronze,
  type CoinBag,
} from '../../systems/Coins';
import { findPost, housingList, isHeroSkill, skillOf, type NpcFields } from '../../systems/Npcs';
import { el } from '../dom';
import { photoField, saveWithPhoto } from '../photos/photoField';
import { moveOutButton } from '../SlotNpcs';
import { buildingLabel, formatCount, formatGold, formatWage } from '../format';
import type { ResourceMenuItem } from '../ResourceMenu';
import {
  button,
  coinInputs,
  confirmButton,
  field,
  numberInput,
  rememberedSelect,
  selectInput,
  thumb,
  type PanelDeps,
} from '../widgets';

const SKILL_KEY = 'npcs.skill';
const IDLE_KEY = 'npcs.idle';
const ALL = 'all';
const STATUSES: readonly NpcStatus[] = ['disponivel', 'ferido', 'em_missao'];

/** NPCs: cards with skills, home and job; players move them, the master edits them. */
export class NpcPanel {
  private editing: string | null = null;
  /** The "Novo NPC" block being filled in, kept across redraws only while it has focus. */
  private draft: HTMLDetailsElement | null = null;
  /** The NPC just created: its card is scrolled into view and highlighted once. */
  private createdId: string | null = null;
  private redraw: () => void = () => undefined;

  constructor(private readonly deps: PanelDeps) {}

  get menuItem(): ResourceMenuItem {
    return {
      id: 'npcs',
      label: t.npcs.title,
      icon: 'icon.npcs',
      summary: (state) =>
        t.npcs.summary(state.npcs.length, state.npcs.filter((n) => n.job !== null).length),
      compactSummary: (state) => formatCount(state.npcs.length),
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
    };
  }

  private render(): HTMLElement[] {
    const { store, session } = this.deps;
    const state = store.current;
    const list =
      state.npcs.length === 0 ? el('p', { class: 'panel__hint' }, t.npcs.empty) : this.list(state);
    return [
      ...(session.isActive ? [this.newNpcForm()] : []),
      ...(state.npcs.length > 0 ? [this.filters(store.catalog)] : []),
      list,
    ];
  }

  private filters(catalog: Catalog): HTMLElement {
    const { memory } = this.deps;
    const skill = rememberedSelect(memory, {
      key: SKILL_KEY,
      label: t.npcs.filterSkill,
      options: [
        { value: ALL, label: t.npcs.allSkills },
        ...catalog.skills.map((s) => ({ value: s.id, label: `${s.icon} ${s.name}` })),
      ],
    });
    skill.addEventListener('change', () => this.redraw());
    const idle = el('input', { type: 'checkbox', checked: memory.get(IDLE_KEY) === '1' });
    idle.addEventListener('change', () => {
      memory.set(IDLE_KEY, idle.checked ? '1' : '');
      this.redraw();
    });
    return el(
      'div',
      { class: 'row row--wrap' },
      field(t.npcs.filterSkill, skill),
      el('label', { class: 'row' }, idle, t.npcs.onlyIdle),
    );
  }

  /** Filtered by "no job", sorted by the chosen skill (best first). */
  private list(state: GameState): HTMLElement {
    const { memory, store } = this.deps;
    const skillIds = store.catalog.skills.map((s) => s.id);
    const skill = memory.pick(SKILL_KEY, [ALL, ...skillIds], ALL);
    const onlyIdle = memory.get(IDLE_KEY) === '1';
    const shown = state.npcs
      .filter((npc) => !onlyIdle || npc.job === null)
      .filter((npc) => skill === ALL || skillOf(npc, skill) > 0)
      .sort((a, b) => (skill === ALL ? 0 : skillOf(b, skill) - skillOf(a, skill)));
    if (shown.length === 0) return el('p', { class: 'panel__hint' }, t.npcs.noMatch);
    return el('ul', { class: 'item-list' }, ...shown.map((npc) => this.card(npc)));
  }

  private card(npc: Npc): HTMLElement {
    const { store, session } = this.deps;
    const { catalog } = store;
    const isCreated = npc.id === this.createdId;
    const node = el(
      'li',
      { class: `item npc-card${isCreated ? ' npc-card--created' : ''}` },
      el(
        'div',
        { class: 'card__head' },
        thumb(store, { image: npc.portrait, name: npc.name }, 'md'),
        el(
          'div',
          {},
          el('h3', { class: 'card__name' }, npc.name),
          el(
            'p',
            { class: 'card__sub' },
            [npc.title, t.npcs.statuses[npc.status]].filter(Boolean).join(' · '),
          ),
        ),
      ),
      npc.description && el('p', { class: 'item__desc' }, npc.description),
      this.skillBars(npc),
      el('p', { class: 'card__sub' }, formatWage(catalog, npc.wage)),
      (npc.earnings ?? 0) > 0 &&
        el(
          'p',
          { class: 'card__sub' },
          t.missions.npcEarned(formatGold(catalog, npc.earnings ?? 0)),
        ),
      this.homeRow(npc),
      this.jobRow(npc),
      session.isActive && this.masterControls(npc),
    );
    if (isCreated) {
      this.createdId = null;
      // After the menu puts its scroll position back.
      queueMicrotask(() => node.scrollIntoView({ block: 'nearest' }));
    }
    return node;
  }

  private skillBars(npc: Npc): HTMLElement {
    const { skills } = this.deps.store.catalog;
    return el(
      'ul',
      { class: 'npc-skills' },
      ...skills.map((skill) => {
        const level = skillOf(npc, skill.id);
        return el(
          'li',
          { class: 'npc-skill', title: skill.description },
          el('span', { class: 'npc-skill__name' }, `${skill.icon} ${skill.name}`),
          skillBar(level),
          el('span', { class: `npc-skill__value${valueTone(level)}` }, String(level)),
        );
      }),
    );
  }

  private homeRow(npc: Npc): HTMLElement {
    const { store, act } = this.deps;
    const homes = housingList(store.current, store.catalog);
    const select = selectInput({
      label: t.npcs.home,
      value: npc.home ?? '',
      options: [
        { value: '', label: t.npcs.noHome },
        ...homes.map((h) => ({
          value: h.slotId,
          label: t.npcs.homeOption(
            buildingLabel(store.catalog, h.buildingId, h.slotId),
            h.residents,
            h.capacity,
          ),
          disabled: h.residents >= h.capacity && h.slotId !== npc.home,
        })),
      ],
    });
    // A refused move would leave the select on the wrong home, so redraw from the state.
    select.addEventListener('change', () => {
      if (!act({ type: 'npc_set_home', npcId: npc.id, slotId: select.value || null })) {
        this.redraw();
      }
    });
    const moveOut = () => act({ type: 'npc_set_home', npcId: npc.id, slotId: null });
    return el(
      'div',
      { class: 'row row--wrap' },
      field(t.npcs.home, select),
      npc.home && moveOutButton(store, npc, t.npcs.moveOutOfHome, moveOut),
    );
  }

  private jobRow(npc: Npc): HTMLElement {
    const { store, act } = this.deps;
    const post = npc.job && findPost(store.current, store.catalog, npc.job);
    if (!npc.job || !post) return el('p', { class: 'card__sub' }, `${t.npcs.job}: ${t.npcs.noJob}`);
    const building = store.catalog.buildings.find((b) => b.id === post.buildingId)?.name ?? '';
    const research = store.current.research.entries.find((r) => r.id === npc.job?.researchId);
    const text = t.npcs.jobAt(post.job.name, building) + (research ? ` · ${research.title}` : '');
    return el(
      'div',
      { class: 'row row--wrap' },
      el('span', { class: 'card__sub' }, `${t.npcs.job}: ${text}`),
      button(t.npcs.unassign, () => act({ type: 'npc_unassign', npcId: npc.id })),
    );
  }

  private masterControls(npc: Npc): HTMLElement {
    const isEditing = this.editing === npc.id;
    return el(
      'div',
      { class: 'item__master' },
      el(
        'div',
        { class: 'row row--wrap' },
        button(t.common.edit, () => this.update(() => (this.editing = isEditing ? null : npc.id))),
        confirmButton(t.common.remove, () => this.deps.act({ type: 'npc_remove', npcId: npc.id })),
      ),
      isEditing &&
        this.npcForm(npc, (fields, status) => {
          const command = { type: 'npc_update', npcId: npc.id, ...fields, status } as const;
          const done = this.deps.act(command);
          if (done) this.update(() => (this.editing = null));
          return done;
        }),
    );
  }

  /**
   * Always starts closed (on opening the panel, after creating, on redraws),
   * except while the master is typing in it.
   */
  private newNpcForm(): HTMLElement {
    if (this.draft?.contains(document.activeElement)) return this.draft;
    const form = this.npcForm(undefined, (fields, _status, id) => {
      this.draft = null;
      this.createdId = id;
      if (this.deps.act({ type: 'npc_create', id, ...fields })) return true;
      this.draft = details;
      this.createdId = null;
      return false;
    });
    const details = el(
      'details',
      { class: 'card card--master' },
      el('summary', { class: 'section-title' }, t.npcs.newNpc),
      form,
    );
    this.draft = details;
    return details;
  }

  /**
   * Shared create/edit form; the status select only appears when editing.
   * `onSubmit` gets the id the portrait was stored under: the NPC's, or a new one.
   */
  private npcForm(
    npc: Npc | undefined,
    onSubmit: (fields: NpcFields, status: NpcStatus, id: string) => boolean,
  ): HTMLElement {
    const { store } = this.deps;
    const { catalog } = store;
    const id = npc?.id ?? newId('npc');
    const { skills } = catalog;
    const input = (value: string | undefined) =>
      el('input', { class: 'input input--wide', value: value ?? '' });
    const name = input(npc?.name);
    const title = input(npc?.title);
    const portrait = photoField({ source: store, current: npc?.portrait, name: npc?.name ?? '' });
    const description = input(npc?.description);
    const wage = wageInputs(catalog, npc?.wage);
    const status = selectInput({
      label: t.npcs.status,
      value: npc && STATUSES.includes(npc.status) ? npc.status : 'disponivel',
      options: STATUSES.map((s) => ({ value: s, label: t.npcs.statuses[s] })),
    });
    const levels = skills.map((skill) => ({
      skill,
      input: numberInput({
        min: MIN_SKILL,
        max: MAX_SKILL,
        value: npc ? skillOf(npc, skill.id) : 0,
        label: skill.name,
      }),
    }));
    const attributes = attributeInputs(catalog, npc);
    const read = (image: string): NpcFields => {
      const wageValue = wage.read();
      return {
        name: name.value,
        title: title.value,
        portrait: image,
        description: description.value,
        skills: Object.fromEntries(
          levels.map(({ skill, input }) => [skill.id, clampSkill(Number(input.value))]),
        ),
        attributes: attributes.read(),
        wage: wageValue > 0 ? wageValue : undefined,
      };
    };
    const form = el(
      'form',
      {
        class: 'subform',
        onsubmit: (event: Event) => {
          event.preventDefault();
          void saveWithPhoto(portrait, { kind: 'npc', id }, (image) =>
            onSubmit(read(image), parseStatus(status.value), id),
          );
        },
      },
      field(t.common.name, name),
      field(t.npcs.titleField, title),
      el('div', { class: 'field' }, el('span', {}, t.npcs.portrait), portrait.element),
      field(t.common.description, description),
      el('div', { class: 'field' }, el('span', {}, t.npcs.wage), wage.element, wage.preview),
      npc && field(t.npcs.status, status),
      el(
        'div',
        { class: 'npc-skill-inputs' },
        ...levels.map(({ skill, input }) => field(`${skill.icon} ${skill.name}`, input)),
      ),
      attributes.element,
      el(
        'div',
        { class: 'row row--end' },
        el(
          'button',
          { class: 'btn btn--primary', type: 'submit' },
          npc ? t.common.save : t.common.add,
        ),
      ),
    );
    portrait.listenOn(form);
    return form;
  }

  private update(change: () => void): void {
    change();
    this.redraw();
  }
}

/** Coin fields for the daily wage, stored in gold, with a live "Salário: …/dia" line. */
function wageInputs(catalog: Catalog, wage: number | undefined) {
  const goldValue = goldInBronze(catalog);
  const toGold = (bag: CoinBag) => bronzeToGold(toBronze(bag, catalog.currencies), goldValue);
  const preview = el('p', { class: 'card__sub' }, formatWage(catalog, wage));
  const inputs = coinInputs(catalog, {
    initial: fromBronze(goldToBronze(wage ?? 0, goldValue), catalog.currencies),
    onInput: (bag) => (preview.textContent = formatWage(catalog, toGold(bag))),
  });
  return { element: inputs.element, preview, read: () => toGold(inputs.read()) };
}

function clampSkill(value: number): number {
  return clampLevel(value, MIN_SKILL, MAX_SKILL);
}

function clampLevel(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Força, Destreza and Poder Mágico: the master's eyes only. They are shown
 * nowhere else (cards, lists, the mission picker); they only speed up missions.
 */
function attributeInputs(catalog: Catalog, npc: Npc | undefined) {
  const inputs = catalog.attributes.map((attribute) => ({
    attribute,
    input: numberInput({
      min: MIN_ATTRIBUTE,
      max: MAX_ATTRIBUTE,
      value: npc?.attributes?.[attribute.id] ?? 0,
      label: attribute.name,
    }),
  }));
  const element = el(
    'fieldset',
    { class: 'npc-attributes' },
    el('legend', { class: 'section-title' }, t.npcs.attributes),
    el('p', { class: 'panel__hint' }, t.npcs.attributesHint),
    el(
      'div',
      { class: 'npc-skill-inputs' },
      ...inputs.map(({ attribute, input }) => field(`${attribute.icon} ${attribute.name}`, input)),
    ),
  );
  const read = () =>
    Object.fromEntries(
      inputs.map(({ attribute, input }) => [
        attribute.id,
        clampLevel(Number(input.value), MIN_ATTRIBUTE, MAX_ATTRIBUTE),
      ]),
    );
  return { element, read };
}

function valueTone(level: number): string {
  if (level < 0) return ' is-negative';
  return isHeroSkill(level) ? ' is-hero' : '';
}

/** Grows right from the middle in gold (brighter at hero levels), or left in red for a skill that hinders. */
function skillBar(level: number): HTMLElement {
  const isNegative = level < 0;
  const width = (Math.min(MAX_SKILL, Math.abs(level)) / MAX_SKILL) * 50;
  return el(
    'div',
    {
      class: 'progress npc-skill-bar',
      role: 'meter',
      'aria-valuemin': String(MIN_SKILL),
      'aria-valuemax': String(MAX_SKILL),
      'aria-valuenow': String(level),
    },
    el('div', {
      class: `npc-skill-bar__fill${valueTone(level)}`,
      style: `${isNegative ? 'right' : 'left'}: 50%; width: ${width}%`,
    }),
  );
}

function parseStatus(value: string): NpcStatus {
  return STATUSES.find((s) => s === value) ?? 'disponivel';
}
