import { t } from '../../i18n/pt-BR';
import type { GameState } from '../../model/schema';
import type { GameStore } from '../../store';
import {
  averageInfluence,
  setWorldInfluence,
  worldStandings,
  type WorldStanding,
} from '../../systems/Influence';
import { el } from '../dom';
import type { MasterSession } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import { progressBar, stepper, thumb, type Act, type PanelDeps } from '../widgets';

/** Influência: the fixed worlds and their average, the overall influence. */
export class InfluencePanel {
  private readonly store: GameStore;
  private readonly session: MasterSession;
  private readonly act: Act;

  constructor({ store, session, act }: PanelDeps) {
    this.store = store;
    this.session = session;
    this.act = act;
  }

  get menuItem(): ResourceMenuItem {
    const total = (state: GameState) => t.percent(this.total(state));
    return {
      id: 'influence',
      label: t.resources.influence,
      icon: 'icon.influence',
      summary: total,
      compactSummary: total,
      render: () => this.render(),
    };
  }

  private render(): HTMLElement[] {
    const standings = this.standings(this.store.current);
    const total = averageInfluence(standings);
    return [
      el(
        'div',
        { class: 'influence-total' },
        el(
          'div',
          { class: 'influence-total__head' },
          el('h3', { class: 'popover__title' }, t.influence.total),
          el('strong', { class: 'influence-total__value' }, t.percent(total)),
        ),
        progressBar(total / 100),
        el('p', { class: 'panel__hint' }, t.influence.totalHint),
      ),
      el('h3', { class: 'section-title' }, t.influence.worlds),
      el('ul', { class: 'item-list' }, ...standings.map((standing) => this.row(standing))),
    ];
  }

  private row({ world, influence }: WorldStanding): HTMLElement {
    const { catalog } = this.store;
    return el(
      'li',
      { class: 'item world', title: world.description ?? '' },
      el(
        'div',
        { class: 'item-row' },
        thumb(catalog, { image: world.icon, name: world.name, color: world.color }),
        el('span', { class: 'item-row__name' }, world.name),
        el('span', { class: 'item-row__value' }, t.percent(influence)),
      ),
      progressBar(influence / 100, world.color),
      world.description && el('p', { class: 'item__desc' }, world.description),
      this.session.isActive &&
        stepper(
          influence,
          (value) =>
            this.act((s) => setWorldInfluence(s, catalog.worlds, { worldId: world.id, value })),
          { label: world.name },
        ),
    );
  }

  private standings(state: GameState): WorldStanding[] {
    return worldStandings(this.store.catalog.worlds, state.influence);
  }

  private total(state: GameState): number {
    return averageInfluence(this.standings(state));
  }
}
