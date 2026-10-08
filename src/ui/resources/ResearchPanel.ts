import { t } from '../../i18n/pt-BR';
import type { Research, ResearchStatus } from '../../model/schema';
import type { GameStore } from '../../store';
import {
  addResearch,
  addResearchCategory,
  completeResearch,
  hasResearchArchive,
  removeResearch,
  removeResearchCategory,
  renameResearchCategory,
  researchCounts,
  updateResearch,
} from '../../systems/Research';
import { el } from '../dom';
import type { MasterSession } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import type { UiMemory } from '../uiMemory';
import { button, categoryManager, confirmButton, type Act, type PanelDeps } from '../widgets';
import { researchForm, researchSummary } from './researchViews';

const TAB_KEY = 'research.tab';
const STATUSES: readonly ResearchStatus[] = ['em_andamento', 'concluida'];

/** Pesquisa: compact lists by status; the master registers and edits research here. */
export class ResearchPanel {
  /** Research id being edited, or "new" for the creation form. */
  private editing: string | null = null;
  private redraw: () => void = () => undefined;

  private readonly store: GameStore;
  private readonly session: MasterSession;
  private readonly act: Act;
  private readonly memory: UiMemory;

  /** Active status tab, remembered across re-renders and reloads. */
  private get tab(): ResearchStatus {
    return this.memory.get(TAB_KEY) === 'concluida' ? 'concluida' : 'em_andamento';
  }

  private set tab(status: ResearchStatus) {
    this.memory.set(TAB_KEY, status);
  }

  constructor({ store, session, act, memory }: PanelDeps) {
    this.store = store;
    this.session = session;
    this.act = act;
    this.memory = memory;
  }

  get menuItem(): ResourceMenuItem {
    return {
      id: 'research',
      label: t.resources.research,
      icon: 'icon.research',
      summary: (state) => {
        const { done, inProgress } = researchCounts(state.research);
        return t.resources.researchSummary(done, inProgress);
      },
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
    };
  }

  private render(): HTMLElement[] {
    const state = this.store.current;
    const isMaster = this.session.isActive;
    const entries = state.research.entries.filter((r) => r.status === this.tab);
    return [
      this.tabs(),
      entries.length === 0
        ? el('p', { class: 'panel__hint' }, t.research.empty)
        : el('ul', { class: 'item-list' }, ...entries.map((entry) => this.row(entry))),
      !hasResearchArchive(state) && el('p', { class: 'notice' }, t.research.buildStationHint),
      ...(isMaster ? this.masterTools() : []),
    ].filter((node): node is HTMLElement => Boolean(node));
  }

  private tabs(): HTMLElement {
    return el(
      'nav',
      { class: 'tabs', role: 'tablist' },
      ...STATUSES.map((status) =>
        el(
          'button',
          {
            class: status === this.tab ? 'tab tab--active' : 'tab',
            type: 'button',
            role: 'tab',
            'aria-selected': String(status === this.tab),
            onclick: () => this.update(() => (this.tab = status)),
          },
          t.research.statuses[status],
        ),
      ),
    );
  }

  private row(entry: Research): HTMLElement {
    const { research } = this.store.current;
    const isMaster = this.session.isActive;
    return el(
      'li',
      { class: 'item research' },
      ...researchSummary(research, entry),
      isMaster &&
        el(
          'div',
          { class: 'row row--wrap' },
          button(t.common.edit, () => this.update(() => (this.editing = entry.id))),
          entry.status === 'em_andamento' &&
            button(t.research.complete, () => this.act((s) => completeResearch(s, entry.id))),
          confirmButton(t.common.remove, () => this.act((s) => removeResearch(s, entry.id))),
        ),
      isMaster && this.editing === entry.id && this.form(entry),
    );
  }

  private masterTools(): HTMLElement[] {
    const { research } = this.store.current;
    return [
      this.editing === 'new'
        ? this.form(undefined)
        : button(t.research.newResearch, () => this.update(() => (this.editing = 'new')), {
            primary: true,
            disabled: research.categories.length === 0,
          }),
      categoryManager(
        this.act,
        { categories: research.categories, currentId: null, isCurrentEmpty: false },
        {
          add: (name) => (s) => addResearchCategory(s, name),
          rename: (id, name) => (s) => renameResearchCategory(s, id, name),
          remove: (id) => (s) => removeResearchCategory(s, id),
        },
      ),
      this.categoryList(),
    ];
  }

  /** Rename and remove for research categories, which have no tabs of their own. */
  private categoryList(): HTMLElement {
    const { research } = this.store.current;
    return el(
      'ul',
      { class: 'item-list card--master' },
      ...research.categories.map((category) => {
        const input = el('input', { class: 'input input--wide', value: category.name });
        const isEmpty = !research.entries.some((r) => r.category === category.id);
        return el(
          'li',
          { class: 'row row--wrap' },
          input,
          button(t.common.save, () =>
            this.act((s) => renameResearchCategory(s, category.id, input.value)),
          ),
          isEmpty
            ? confirmButton(t.common.remove, () =>
                this.act((s) => removeResearchCategory(s, category.id)),
              )
            : button(t.common.remove, () => undefined, {
                disabled: true,
                title: t.categories.removeHint,
              }),
        );
      }),
    );
  }

  private form(entry: Research | undefined): HTMLElement {
    const close = () => this.update(() => (this.editing = null));
    return researchForm(this.store.current, entry, {
      memory: this.memory,
      onCancel: close,
      onSubmit: (draft) => {
        const done = this.act((s) =>
          entry ? updateResearch(s, entry.id, draft) : addResearch(s, draft),
        );
        if (done) close();
      },
    });
  }

  private update(change: () => void): void {
    change();
    this.redraw();
  }
}
