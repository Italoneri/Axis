import { t } from '../../i18n/pt-BR';
import type { World } from '../../model/schema';
import type { GameStore } from '../../store';
import {
  addWorld,
  clampPercent,
  removeWorld,
  setTotalInfluence,
  setWorldInfluence,
  updateWorld,
  worldsByInfluence,
  type WorldFields,
} from '../../systems/Influence';
import { el } from '../dom';
import type { MasterSession } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import {
  button,
  confirmButton,
  field,
  numberInput,
  progressBar,
  stepper,
  thumb,
  type Act,
} from '../widgets';

const DEFAULT_WORLD_COLOR = '#7fb069';

/** Influência: the overall value and one independent value per world. */
export class InfluencePanel {
  /** World id being edited, or "new" for the creation form. */
  private editing: string | null = null;
  private redraw: () => void = () => undefined;

  constructor(
    private readonly store: GameStore,
    private readonly session: MasterSession,
    private readonly act: Act,
  ) {}

  get menuItem(): ResourceMenuItem {
    return {
      id: 'influence',
      label: t.resources.influence,
      icon: 'icon.influence',
      summary: (state) => `${state.influence.total}%`,
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
    };
  }

  private render(): HTMLElement[] {
    const { influence } = this.store.current;
    const isMaster = this.session.isActive;
    const worlds = worldsByInfluence(influence.worlds);
    return [
      el(
        'div',
        { class: 'influence-total' },
        el(
          'div',
          { class: 'influence-total__head' },
          el('h3', { class: 'popover__title' }, t.influence.total),
          el('strong', { class: 'influence-total__value' }, `${influence.total}%`),
        ),
        progressBar(influence.total / 100),
        isMaster
          ? stepper(influence.total, (value) => this.act((s) => setTotalInfluence(s, value)), {
              label: t.influence.total,
            })
          : el('p', { class: 'panel__hint' }, t.influence.totalHint),
      ),
      el('h3', { class: 'section-title' }, t.influence.worlds),
      worlds.length === 0
        ? el('p', { class: 'panel__hint' }, t.influence.noWorlds)
        : el('ul', { class: 'item-list' }, ...worlds.map((world) => this.row(world))),
      ...(isMaster ? [this.newWorld()] : []),
    ];
  }

  private row(world: World): HTMLElement {
    const { catalog } = this.store;
    const isMaster = this.session.isActive;
    return el(
      'li',
      { class: 'item world', title: world.description ?? '' },
      el(
        'div',
        { class: 'item-row' },
        thumb(catalog, { image: world.icon, name: world.name, color: world.color }),
        el('span', { class: 'item-row__name' }, world.name),
        el('span', { class: 'item-row__value' }, `${world.influence}%`),
      ),
      progressBar(world.influence / 100, world.color),
      world.description && el('p', { class: 'item__desc' }, world.description),
      isMaster &&
        el(
          'div',
          { class: 'row row--wrap' },
          stepper(
            world.influence,
            (value) => this.act((s) => setWorldInfluence(s, world.id, value)),
            {
              label: world.name,
            },
          ),
          button(t.common.edit, () => this.update(world.id)),
          confirmButton(t.common.remove, () => this.act((s) => removeWorld(s, world.id))),
        ),
      isMaster &&
        this.editing === world.id &&
        this.form(world, (fields) => {
          if (this.act((s) => updateWorld(s, world.id, fields))) this.update(null);
        }),
    );
  }

  private newWorld(): HTMLElement {
    if (this.editing !== 'new') {
      return button(t.influence.newWorld, () => this.update('new'), { primary: true });
    }
    const influence = numberInput({ min: 0, max: 100, value: 0, label: t.influence.percent });
    return this.form(
      undefined,
      (fields) => {
        const added = this.act((s) =>
          addWorld(s, { ...fields, influence: clampPercent(Number(influence.value)) }),
        );
        if (added) this.update(null);
      },
      field(t.influence.percent, influence),
    );
  }

  private form(
    world: World | undefined,
    onSubmit: (fields: WorldFields) => void,
    ...extra: HTMLElement[]
  ): HTMLElement {
    const name = el('input', { class: 'input input--wide', value: world?.name ?? '' });
    const color = el('input', {
      class: 'input',
      type: 'color',
      value: world?.color ?? DEFAULT_WORLD_COLOR,
    });
    const icon = el('input', { class: 'input input--wide', value: world?.icon ?? '' });
    const description = el('input', {
      class: 'input input--wide',
      value: world?.description ?? '',
    });
    return el(
      'form',
      {
        class: 'subform card--master',
        onsubmit: (event: Event) => {
          event.preventDefault();
          onSubmit({
            name: name.value,
            color: color.value,
            icon: icon.value,
            description: description.value,
          });
        },
      },
      field(t.common.name, name),
      field(t.common.color, color),
      field(t.common.icon, icon),
      field(t.common.description, description),
      ...extra,
      el(
        'div',
        { class: 'row row--end' },
        button(t.common.cancel, () => this.update(null)),
        el(
          'button',
          { class: 'btn btn--primary', type: 'submit' },
          world ? t.common.save : t.common.add,
        ),
      ),
    );
  }

  private update(editing: string | null): void {
    this.editing = editing;
    this.redraw();
  }
}
