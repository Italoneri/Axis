import type { Actor, GameCommand } from '../../commands/schema';
import { stationLabel } from '../../i18n/stationLabel';
import { t } from '../../i18n/pt-BR';
import type { GameStore } from '../../store';
import { gardenLevel } from '../../systems/Garden';
import { recipesFor } from '../../systems/Lab';
import { findMaterial } from '../../systems/Materials';
import { el } from '../dom';
import type { MasterAccess } from '../MasterSession';
import { button, closeButton, confirmButton, keepEscapeInside } from '../widgets';
import { LabScene, potionIcon, progressBar, recipeRow, type ReadyView } from './LabScene';
import { labSummary, recipeOptions, stationViews, type StationView } from './labViews';

export interface LabWindowDeps {
  game: GameStore;
  session: MasterAccess;
  viewer: () => Actor;
  openGarden: () => void;
}

/**
 * "Laboratório Arcano": the workshop drawn in code (LabScene), a strip with
 * what was collected and the ingredients in stock, and a card list of the same
 * stations on narrow screens. It re-renders with the game, so brews and other
 * players' actions show up while the window is open.
 */
export class LabWindow {
  private dialog: HTMLDialogElement | null = null;
  private stopWatching: (() => void) | null = null;
  /** The open card (narrow screens); the scene keeps its own popover. */
  private selectedStationId: string | null = null;
  private readonly header = el('header', { class: 'menu__header' });
  private readonly body = el('div', { class: 'menu__body garden-body' });
  private readonly scene: LabScene;
  private readonly strip = el('div', { class: 'garden-strip' });
  private readonly cards = el('ul', { class: 'garden-cards' });
  /** Collected while the window is open, by potion material: where the icons fly. */
  private collected = new Map<string, number>();

  constructor(private readonly deps: LabWindowDeps) {
    this.scene = new LabScene({
      game: deps.game,
      viewer: deps.viewer,
      onCollect: (view) => this.recordCollect(view),
      collectTarget: (outputId) =>
        this.strip.querySelector(`[data-output-id="${CSS.escape(outputId)}"]`),
      gardenBuilt: () => gardenLevel(deps.game.current) > 0,
      openGarden: () => this.openGarden(),
    });
    // Leaving the master tools hides the hidden recipes.
    deps.session.subscribe(() => this.render());
  }

  open(): void {
    if (this.dialog) return;
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.selectedStationId = null;
    this.collected = new Map();
    this.stopWatching = this.deps.game.subscribe(() => this.render());
    document.body.append(dialog);
    this.render();
    dialog.showModal();
  }

  private openGarden(): void {
    this.dialog?.close();
    this.deps.openGarden();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--menu dialog--garden', 'aria-label': t.lab.title },
      this.header,
      this.body,
    );
    keepEscapeInside(dialog);
    this.closePopoverOnEscape(dialog);
    dialog.addEventListener('pointerdown', ({ target }) => {
      const inside = target instanceof Element && target.closest('.lab-pop, .lab-station');
      if (!inside) this.scene.closePopover();
    });
    dialog.addEventListener('close', () => {
      this.scene.closePopover();
      this.stopWatching?.();
      this.stopWatching = null;
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  /** Esc closes the open popover first, and only then the window. */
  private closePopoverOnEscape(dialog: HTMLDialogElement): void {
    let swallowCancel = false;
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.scene.hasPopover()) return;
      event.preventDefault();
      this.scene.closePopover();
      swallowCancel = true;
      setTimeout(() => (swallowCancel = false), 0);
    });
    dialog.addEventListener('cancel', (event) => {
      if (swallowCancel) event.preventDefault();
    });
  }

  private render(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const { game } = this.deps;
    const views = stationViews(game.current, game.catalog);
    if (!views.some((view) => view.station.id === this.selectedStationId)) {
      this.selectedStationId = null;
    }
    const { ready } = labSummary(views);
    this.header.replaceChildren(
      el('h2', { class: 'panel__title' }, t.lab.title),
      el(
        'div',
        { class: 'garden-header__tools' },
        button(t.lab.collectAllCount(ready), () => this.scene.collectAll(), {
          primary: true,
          disabled: ready === 0,
        }),
        closeButton(t.lab.close, () => dialog.close()),
      ),
    );
    if (views.length === 0) {
      this.body.replaceChildren(el('p', { class: 'notice' }, t.lab.notBuilt));
      return;
    }
    // Taking the scene out and back in would restart every bubble and rune.
    if (this.scene.root.parentElement !== this.body) {
      this.body.replaceChildren(this.scene.root, this.strip, this.cards);
    }
    this.scene.update(views);
    this.renderStrip();
    this.cards.replaceChildren(...views.map((view) => this.card(view)));
  }

  private recordCollect(view: ReadyView): void {
    const { outputId, outputQty } = view.brew;
    this.collected.set(outputId, (this.collected.get(outputId) ?? 0) + outputQty);
    this.renderStrip();
  }

  private renderStrip(): void {
    const { game } = this.deps;
    const { materials } = game.current;
    const collected = [...this.collected].flatMap(([outputId, quantity]) => {
      const material = findMaterial(materials, outputId);
      if (!material) return [];
      return [chip(potionIcon(game, { outputId }), material.name, quantity, outputId)];
    });
    const ingredients = this.knownIngredients().flatMap((materialId) => {
      const material = findMaterial(materials, materialId);
      return material ? [chip(null, material.name, material.quantity)] : [];
    });
    this.strip.replaceChildren(
      stripSection(t.lab.scene.collectedTitle, collected, t.lab.scene.nothingCollected),
      stripSection(t.lab.scene.ingredientsTitle, ingredients, t.lab.scene.noIngredients),
    );
  }

  /** Ingredients of the recipes the viewer can see, each once. */
  private knownIngredients(): string[] {
    const state = this.deps.game.current;
    const isMaster = this.deps.viewer().role === 'master';
    const types = ['alambique', 'caldeirao', 'circulo'] as const;
    const ids = types
      .flatMap((type) => recipesFor(state, type, isMaster))
      .flatMap((recipe) => recipe.ingredients.map((i) => i.materialId));
    return [...new Set(ids)];
  }

  // ---------- Narrow screens ----------

  private card(view: StationView): HTMLElement {
    const { station } = view;
    const isOpen = station.id === this.selectedStationId;
    return el(
      'li',
      { class: `garden-card garden-card--${view.kind}` },
      el(
        'button',
        {
          class: 'garden-card__head',
          type: 'button',
          'aria-expanded': String(isOpen),
          onclick: () => this.toggle(station.id),
        },
        el('strong', {}, stationLabel(station.id)),
        el('span', { class: 'panel__hint' }, stateText(view)),
      ),
      isOpen && el('div', { class: 'garden-card__panel' }, this.stationPanel(view)),
    );
  }

  private stationPanel(view: StationView): HTMLElement {
    const heading = el(
      'div',
      { class: 'garden-panel__head' },
      el('h3', { class: 'section-title' }, stationLabel(view.station.id)),
      closeButton(t.lab.closePopover, () => this.toggle(view.station.id)),
    );
    switch (view.kind) {
      case 'free':
        return el('div', { class: 'garden-panel' }, heading, this.recipeList(view));
      case 'brewing':
        return el(
          'div',
          { class: 'garden-panel' },
          heading,
          el('p', {}, `${view.potionName} · ${t.lab.yields(view.brew.outputQty)}`),
          progressBar(view.progress),
          el('p', { class: 'panel__hint' }, t.lab.daysLeft(view.daysLeft)),
          confirmButton(t.lab.discard, () =>
            this.send({ type: 'lab_discard', stationId: view.station.id }),
          ),
        );
      case 'ready':
        return el(
          'div',
          { class: 'garden-panel' },
          heading,
          el('p', {}, `${view.potionName} · ${t.lab.yields(view.brew.outputQty)}`),
          button(
            t.lab.collect,
            () => this.send({ type: 'lab_collect', stationId: view.station.id }),
            { primary: true },
          ),
        );
    }
  }

  private recipeList(view: Extract<StationView, { kind: 'free' }>): HTMLElement {
    const { game, viewer } = this.deps;
    const options = recipeOptions(game.current, view.station.type, viewer());
    if (options.length === 0) return el('p', { class: 'panel__hint' }, t.lab.scene.noRecipes);
    return el(
      'ul',
      { class: 'lab-recipes' },
      ...options.map((option) =>
        recipeRow(game, option, () =>
          this.send({ type: 'lab_brew', stationId: view.station.id, recipeId: option.recipe.id }),
        ),
      ),
    );
  }

  private toggle(stationId: string): void {
    this.selectedStationId = this.selectedStationId === stationId ? null : stationId;
    this.render();
  }

  /** Refusals are toasted by the store; the open card only closes once the command went through. */
  private send(command: GameCommand): void {
    if (this.deps.game.dispatch(command) !== null) return;
    this.selectedStationId = null;
    this.render();
  }
}

function stateText(view: StationView): string {
  switch (view.kind) {
    case 'free':
      return t.lab.free;
    case 'brewing':
      return `${view.potionName} · ${t.lab.daysLeft(view.daysLeft)}`;
    case 'ready':
      return `${view.potionName} · ${t.lab.ready}`;
  }
}

/** `outputId` marks a chip of the collected list as the target of the flying icons. */
function chip(
  icon: HTMLElement | null,
  name: string,
  quantity: number,
  outputId?: string,
): HTMLElement {
  return el(
    'span',
    {
      class: quantity > 0 ? 'garden-chip' : 'garden-chip garden-chip--none',
      'data-output-id': outputId,
    },
    icon,
    name,
    el('b', {}, t.lab.scene.owned(quantity)),
  );
}

function stripSection(title: string, chips: readonly HTMLElement[], empty: string): HTMLElement {
  return el(
    'section',
    { class: 'garden-strip__section' },
    el('h3', { class: 'garden-strip__title' }, title),
    chips.length === 0
      ? el('p', { class: 'panel__hint' }, empty)
      : el('div', { class: 'garden-strip__chips' }, ...chips),
  );
}
