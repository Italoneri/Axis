import { t } from '../../i18n/pt-BR';
import type { GameState } from '../../model/schema';
import type { GameStore } from '../../store';
import { averageInfluence, worldStandings, type WorldStanding } from '../../systems/Influence';
import { el } from '../dom';
import type { MasterAccess } from '../MasterSession';
import { photoForm } from '../photos/photoField';
import type { ResourceMenuItem } from '../ResourceMenu';
import { button, progressBar, stepper, thumb, type Act, type PanelDeps } from '../widgets';

/** Influência: the fixed worlds and their average, the overall influence. */
export class InfluencePanel {
  /** World whose photo form is open. */
  private editingPhoto: string | null = null;
  private redraw: () => void = () => undefined;
  private readonly store: GameStore;
  private readonly session: MasterAccess;
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
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
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
    const icon = this.store.current.worldIcons?.[world.id] ?? world.icon;
    const isEditingPhoto = this.editingPhoto === world.id;
    return el(
      'li',
      { class: 'item world', title: world.description ?? '' },
      el(
        'div',
        { class: 'item-row' },
        thumb(this.store, { image: icon, name: world.name, color: world.color }),
        el('span', { class: 'item-row__name' }, world.name),
        el('span', { class: 'item-row__value' }, t.percent(influence)),
      ),
      progressBar(influence / 100, world.color),
      world.description && el('p', { class: 'item__desc' }, world.description),
      this.session.isActive &&
        el(
          'div',
          { class: 'row row--wrap' },
          stepper(
            influence,
            (value) => this.act({ type: 'set_influence', worldId: world.id, value }),
            { label: world.name },
          ),
          button(t.photos.change, () => this.toggleWorldPhoto(world.id), {
            title: t.photos.worldIcon(world.name),
          }),
        ),
      this.session.isActive && isEditingPhoto && this.photoForm(world, icon),
    );
  }

  private toggleWorldPhoto(worldId: string): void {
    this.editingPhoto = this.editingPhoto === worldId ? null : worldId;
    this.redraw();
  }

  private photoForm(world: WorldStanding['world'], icon: string | undefined): HTMLElement {
    return photoForm({
      source: this.store,
      target: { kind: 'world', id: world.id },
      current: icon,
      name: world.name,
      color: world.color,
      act: this.act,
      close: () => this.toggleWorldPhoto(world.id),
    });
  }

  private standings(state: GameState): WorldStanding[] {
    return worldStandings(this.store.catalog.worlds, state.influence);
  }

  private total(state: GameState): number {
    return averageInfluence(this.standings(state));
  }
}
