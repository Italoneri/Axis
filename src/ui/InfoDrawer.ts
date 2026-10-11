import { jobEffectText, logEntryText, t, type TextContext } from '../i18n/pt-BR';
import type { BuildingPreview } from '../map/buildingPreview';
import type { LiveMap } from '../map/liveMap';
import type { GameStore } from '../store';
import { activeBonuses, activePostEffects, type PostEffect } from '../systems/BonusSystem';
import { el, replaceKeepingScroll } from './dom';
import { textContext } from './format';
import type { MasterAccess } from './MasterSession';
import { renderMapVisual } from './MapVisualPanel';
import { renderMasterTools } from './MasterTools';
import type { Act } from './widgets';

export type DrawerTab = 'bonuses' | 'log' | 'master' | 'map';

/** A panel that loads its own data (online only); refreshed each time its tab opens. */
export interface DrawerPanel {
  readonly element: HTMLElement;
  refresh(): Promise<void>;
}

/** Online additions: invites in the master tab, the full history in the log tab. */
export interface DrawerExtras {
  invites?: DrawerPanel | undefined;
  history?: DrawerPanel | undefined;
}

const MASTER_TABS: readonly DrawerTab[] = ['master', 'map'];

/** Left drawer, visible to everyone: active bonuses, event log and (for the master) tools. */
export class InfoDrawer {
  private tab: DrawerTab | null = null;
  private renderedTab: DrawerTab | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: GameStore,
    private readonly session: MasterAccess,
    private readonly map: { liveMap: LiveMap; preview: BuildingPreview },
    private readonly act: Act,
    private readonly extras: DrawerExtras = {},
  ) {
    store.subscribe(() => this.render());
    session.subscribe((isActive) => {
      if (!isActive && this.tab !== null && MASTER_TABS.includes(this.tab)) this.tab = 'bonuses';
      this.render();
    });
  }

  open(tab: DrawerTab): void {
    this.tab = tab;
    this.render();
    this.panelOf(tab)
      ?.refresh()
      .catch((error: unknown) => console.error(`[drawer] refresh ${tab}`, error));
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
      ...(this.session.isActive
        ? [
            { id: 'master' as const, label: t.drawer.masterTab },
            { id: 'map' as const, label: t.drawer.mapTab },
          ]
        : []),
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
    if (tab === 'master') {
      const tools = renderMasterTools(this.store, { session: this.session, act: this.act });
      return this.extras.invites ? [...tools, this.extras.invites.element] : tools;
    }
    if (tab === 'map')
      return renderMapVisual(this.map.liveMap, this.store.catalog, this.map.preview);
    if (tab === 'log') {
      const log = this.renderLog();
      return this.extras.history ? [...log, this.extras.history.element] : log;
    }
    return this.renderBonuses();
  }

  private panelOf(tab: DrawerTab): DrawerPanel | undefined {
    if (tab === 'master') return this.extras.invites;
    if (tab === 'log') return this.extras.history;
    return undefined;
  }

  private renderBonuses(): HTMLElement[] {
    const { catalog } = this.store;
    const bonuses = activeBonuses(this.store.current, catalog);
    const posts = this.renderPostEffects();
    if (bonuses.length === 0) {
      return [el('p', { class: 'panel__hint' }, t.drawer.noBonuses), ...posts];
    }

    const cards = bonuses.map((bonus) => {
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
    return [...cards, ...posts];
  }

  /** Occupied posts: their bonus text or what they yield each day. */
  private renderPostEffects(): HTMLElement[] {
    const { catalog, current } = this.store;
    const posts = activePostEffects(current, catalog);
    if (posts.length === 0) return [];
    const ctx = textContext(catalog, current);
    return [
      el(
        'article',
        { class: 'card' },
        el(
          'div',
          { class: 'card__head' },
          el(
            'div',
            {},
            el('h3', { class: 'card__name' }, t.drawer.postsTitle),
            el('p', { class: 'card__sub' }, t.drawer.postsSub),
          ),
        ),
        el(
          'ul',
          { class: 'effects' },
          ...posts.map((post) =>
            el(
              'li',
              {},
              `${ctx.building(post.buildingId)} · ${post.activity} (${post.workers.join(', ')}): `,
              postEffectText(post, ctx),
            ),
          ),
        ),
      ),
    ];
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

/** The yield of a post, or its penalty when a hindering worker spoils a bonus. */
function postEffectText(post: PostEffect, ctx: TextContext): HTMLElement | string {
  const { effect } = post;
  if (effect.type === 'bonus' && post.hindered && effect.penalty) {
    return el('span', { class: 'is-negative' }, t.drawer.penalty(effect.penalty));
  }
  const text = jobEffectText(effect, post.tenthsPerDay, ctx);
  return post.tenthsPerDay < 0 ? el('span', { class: 'is-negative' }, text) : text;
}
