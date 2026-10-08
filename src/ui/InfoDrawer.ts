import { logEntryText, t } from '../i18n/pt-BR';
import type { SlotEditor } from '../slotEditor';
import type { GameStore } from '../store';
import { activeBonuses } from '../systems/BonusSystem';
import { el, replaceKeepingScroll } from './dom';
import { textContext } from './format';
import type { MasterSession } from './MasterSession';
import { renderMasterTools } from './MasterTools';
import type { Act } from './widgets';

export type DrawerTab = 'bonuses' | 'log' | 'master';

/** Left drawer, visible to everyone: active bonuses, event log and (for the master) tools. */
export class InfoDrawer {
  private tab: DrawerTab | null = null;
  private renderedTab: DrawerTab | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: GameStore,
    private readonly session: MasterSession,
    private readonly editor: SlotEditor,
    private readonly act: Act,
  ) {
    store.subscribe(() => this.render());
    session.subscribe((isActive) => {
      if (!isActive && this.tab === 'master') this.tab = 'bonuses';
      this.render();
    });
    // Only the master tab shows editor state; dragging fires this on every move.
    editor.subscribe(() => {
      if (this.tab === 'master') this.render();
    });
  }

  open(tab: DrawerTab): void {
    this.tab = tab;
    this.render();
  }

  toggle(): void {
    if (this.tab === null) this.open('bonuses');
    else this.close();
  }

  close(): void {
    this.tab = null;
    this.render();
  }

  private render(): void {
    const tab = this.tab;
    this.root.hidden = tab === null;
    const sameView = tab !== null && tab === this.renderedTab;
    this.renderedTab = tab;
    if (tab === null) return;

    const tabs: { id: DrawerTab; label: string }[] = [
      { id: 'bonuses', label: t.drawer.bonusesTab },
      { id: 'log', label: t.drawer.logTab },
      ...(this.session.isActive ? [{ id: 'master' as const, label: t.drawer.masterTab }] : []),
    ];

    replaceKeepingScroll(
      this.root,
      [
        el(
          'header',
          { class: 'panel__header' },
          el(
            'nav',
            { class: 'tabs', role: 'tablist' },
            ...tabs.map(({ id, label }) =>
              el(
                'button',
                {
                  class: id === tab ? 'tab tab--active' : 'tab',
                  type: 'button',
                  role: 'tab',
                  'aria-selected': String(id === tab),
                  onclick: () => this.open(id),
                },
                label,
              ),
            ),
          ),
          el(
            'button',
            {
              class: 'btn btn--icon',
              type: 'button',
              'aria-label': t.drawer.close,
              onclick: () => this.close(),
            },
            '×',
          ),
        ),
        el('div', { class: 'panel__body' }, ...this.renderTab(tab)),
      ],
      { sameView, scroller: '.panel__body' },
    );
  }

  private renderTab(tab: DrawerTab): HTMLElement[] {
    if (tab === 'master')
      return renderMasterTools(this.store, {
        session: this.session,
        editor: this.editor,
        act: this.act,
      });
    if (tab === 'log') return this.renderLog();
    return this.renderBonuses();
  }

  private renderBonuses(): HTMLElement[] {
    const { catalog } = this.store;
    const bonuses = activeBonuses(this.store.current, catalog);
    if (bonuses.length === 0) return [el('p', { class: 'panel__hint' }, t.drawer.noBonuses)];

    return bonuses.map((bonus) => {
      const icon = catalog.buildings.find((b) => b.id === bonus.buildingId)?.icon ?? '';
      return el(
        'article',
        { class: 'card' },
        el(
          'div',
          { class: 'card__head' },
          el('img', { class: 'card__icon', src: catalog.assets.images[icon] ?? '', alt: '' }),
          el(
            'div',
            {},
            el('h3', { class: 'card__name' }, bonus.name),
            el('p', { class: 'card__sub' }, t.level(bonus.level)),
          ),
        ),
        el('ul', { class: 'effects' }, ...bonus.effects.map((effect) => el('li', {}, effect))),
      );
    });
  }

  private renderLog(): HTMLElement[] {
    const { log } = this.store.current;
    if (log.length === 0) return [el('p', { class: 'panel__hint' }, t.drawer.emptyLog)];
    const ctx = textContext(this.store.catalog, this.store.current);
    const newestFirst = [...log].reverse();
    return [
      el(
        'ol',
        { class: 'log' },
        ...newestFirst.map((entry) => el('li', { class: 'log__entry' }, logEntryText(entry, ctx))),
      ),
    ];
  }
}
