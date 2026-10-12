import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import { GUILD_BUILDING_ID } from '../../model/catalog';
import type { Mission } from '../../model/schema';
import { builtLevel } from '../../systems/BuildSystem';
import { missionTab, type MissionTab } from '../../systems/Missions';
import { el } from '../dom';
import type { UiMemory } from '../uiMemory';
import { MissionFocus, type MissionDeps } from './MissionFocus';
import { missionForm, scrollCard } from './missionViews';

const TABS: readonly MissionTab[] = ['abertas', 'andamento', 'concluidas'];
const TAB_MEMORY_KEY = 'missions.tab';

export interface MissionBoardDeps extends MissionDeps {
  memory: UiMemory;
}

/**
 * "Quadro de missões" of the Salão da Guilda: a large <dialog> drawn as a dark
 * wooden board, one scroll per mission, split in Abertas, Em andamento and
 * Concluídas. A scroll opens in front (see `MissionFocus`).
 */
export class MissionBoard {
  private dialog: HTMLDialogElement | null = null;
  private tab: MissionTab = 'abertas';
  private stopWatching: (() => void) | null = null;
  private readonly focus: MissionFocus;
  private readonly tabs = el('nav', { class: 'tabs mission-board__tabs', role: 'tablist' });
  private readonly notice = el('div');
  private readonly pins = el('ul', { class: 'mission-board__pins', role: 'tabpanel' });
  /** Holds the "Nova missão" form, shown only on the Abertas tab. */
  private readonly newSlot = el('div');
  private newMission = el('details');

  constructor(private readonly deps: MissionBoardDeps) {
    this.focus = new MissionFocus(deps);
  }

  open(): void {
    if (this.dialog) return;
    this.tab = parseTab(this.deps.memory.pick(TAB_MEMORY_KEY, TABS, 'abertas'));
    this.newMission = this.newMissionForm();
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.stopWatching = this.deps.game.subscribe(() => {
      this.render();
      this.focus.render();
    });
    document.body.append(dialog);
    this.render();
    dialog.showModal();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--missions', 'aria-label': t.missions.title },
      el(
        'header',
        { class: 'menu__header mission-board__header' },
        el('h2', { class: 'panel__title' }, t.missions.title),
        el(
          'button',
          {
            class: 'btn btn--icon',
            type: 'button',
            'aria-label': t.missions.close,
            onclick: () => dialog.close(),
          },
          '×',
        ),
      ),
      el(
        'div',
        { class: 'mission-board__scroller' },
        el(
          'div',
          { class: 'mission-board' },
          el('span', { class: 'mission-board__gem', 'aria-hidden': 'true' }),
          el(
            'div',
            { class: 'mission-board__wood' },
            this.tabs,
            this.notice,
            this.newSlot,
            this.pins,
          ),
        ),
      ),
    );
    // Esc closes the board; the slot panel behind it should stay open.
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
    dialog.addEventListener('close', () => {
      this.focus.close();
      this.stopWatching?.();
      this.stopWatching = null;
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  private render(): void {
    if (!this.dialog) return;
    const { catalog, current: state } = this.deps.game;
    const byTab = groupByTab(state.missions);
    this.tabs.replaceChildren(...TABS.map((tab) => this.tabButton(tab, byTab[tab].length)));
    // Missions go on while the Guilda is down; only new visits need it (see SlotPanel).
    this.notice.replaceChildren(
      ...(builtLevel(state, GUILD_BUILDING_ID) < 1
        ? [el('p', { class: 'notice' }, t.missions.notBuilt)]
        : []),
    );
    this.newSlot.replaceChildren(...(this.tab === 'abertas' ? [this.newMission] : []));
    const shown = byTab[this.tab];
    this.pins.replaceChildren(
      ...(shown.length === 0
        ? [el('li', { class: 'mission-board__empty' }, t.missions.empty[this.tab])]
        : shown.map((mission) => scrollCard(catalog, mission, (id) => this.focus.open(id)))),
    );
  }

  private tabButton(tab: MissionTab, count: number): HTMLElement {
    const isActive = tab === this.tab;
    return el(
      'button',
      {
        class: isActive ? 'tab tab--active' : 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(isActive),
        onclick: () => {
          this.tab = tab;
          this.deps.memory.set(TAB_MEMORY_KEY, tab);
          this.render();
        },
      },
      t.missions.tabCount(t.missions.tabs[tab], count),
    );
  }

  /** Starts closed; after a mission is pinned it is replaced by a fresh, closed one. */
  private newMissionForm(): HTMLDetailsElement {
    const details = el(
      'details',
      { class: 'card mission-board__new' },
      el('summary', { class: 'section-title' }, t.missions.newMission),
      missionForm({
        catalog: this.deps.game.catalog,
        onSubmit: (fields) => {
          const done = this.deps.act({ type: 'mission_create', id: newId('mission'), ...fields });
          if (done) {
            this.newMission = this.newMissionForm();
            this.newSlot.replaceChildren(this.newMission);
          }
          return done;
        },
      }),
    );
    return details;
  }
}

function groupByTab(missions: readonly Mission[]): Record<MissionTab, Mission[]> {
  const groups: Record<MissionTab, Mission[]> = { abertas: [], andamento: [], concluidas: [] };
  missions.forEach((mission) => groups[missionTab(mission)].push(mission));
  // The latest contracts first, like a board where new ones go on top.
  return {
    abertas: [...groups.abertas].reverse(),
    andamento: groups.andamento,
    concluidas: [...groups.concluidas].reverse(),
  };
}

function parseTab(value: string): MissionTab {
  return TABS.find((tab) => tab === value) ?? 'abertas';
}
