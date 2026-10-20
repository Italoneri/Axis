import { newId } from '../../commands/newId';
import type { Actor, GameCommand } from '../../commands/schema';
import { stationLabel } from '../../i18n/stationLabel';
import { t } from '../../i18n/pt-BR';
import type { GameStore } from '../../store';
import { gardenLevel } from '../../systems/Garden';
import { recipesFor } from '../../systems/Lab';
import { EMPTY_DEPOT } from '../../systems/Depot';
import {
  depotSnapshot,
  refExists,
  refKey,
  refName,
  refQuantity,
  type DepotSnapshot,
} from '../../systems/Stock';
import { el } from '../dom';
import type { MasterAccess } from '../MasterSession';
import type { DepotSource } from '../stock/StockPicker';
import { button, closeButton, confirmButton, keepEscapeInside } from '../widgets';
import type { Recipe, StationType, StockRef } from '../../model/schema';
import { stationTypeSchema } from '../../model/schema';
import { LabScene, potionIcon, progressBar, recipeRow, type ReadyView } from './LabScene';
import {
  labSummary,
  recipeOptions,
  stationViews,
  visibleTabs,
  type LabTab,
  type StationView,
} from './labViews';
import { openRecipeForm } from './RecipeForm';

export interface LabWindowDeps {
  game: GameStore;
  session: MasterAccess;
  viewer: () => Actor;
  openGarden: () => void;
  /** The depot store: potions and ingredients linked to group items count from it. */
  depot?: DepotSource | undefined;
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
  private tab: LabTab = 'lab';
  private readonly header = el('header', { class: 'menu__header' });
  private readonly tabs = el('nav', { class: 'tabs garden-tabs', role: 'tablist' });
  private readonly body = el('div', { class: 'menu__body garden-body' });
  private readonly scene: LabScene;
  private readonly strip = el('div', { class: 'garden-strip' });
  private readonly cards = el('ul', { class: 'garden-cards' });
  /** Collected while the window is open, by `refKey` of the potion: where the icons fly. */
  private collected = new Map<string, { output: StockRef; quantity: number }>();

  constructor(private readonly deps: LabWindowDeps) {
    this.scene = new LabScene({
      game: deps.game,
      viewer: deps.viewer,
      depot: () => this.snapshot(),
      onCollect: (view) => this.recordCollect(view),
      collectTarget: (outputKey) =>
        this.strip.querySelector(`[data-output-id="${CSS.escape(outputKey)}"]`),
      gardenBuilt: () => gardenLevel(deps.game.current) > 0,
      openGarden: () => this.openGarden(),
    });
    // Leaving the master tools hides the recipes tab and the hidden recipes.
    deps.session.subscribe(() => this.render());
  }

  open(): void {
    if (this.dialog) return;
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.selectedStationId = null;
    this.tab = 'lab';
    this.collected = new Map();
    const stopGame = this.deps.game.subscribe(() => this.render());
    const stopDepot = this.deps.depot?.subscribe(() => this.render());
    this.stopWatching = () => {
      stopGame();
      stopDepot?.();
    };
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
      this.tabs,
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
    const tabs = visibleTabs(this.isMaster());
    if (!tabs.includes(this.tab)) this.tab = 'lab';
    this.tabs.replaceChildren(...tabs.map((tab) => this.tabButton(tab)));
    if (this.tab === 'recipes') {
      this.scene.closePopover();
      this.renderRecipes(dialog);
      return;
    }
    const views = stationViews(game.current, game.catalog, this.snapshot());
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

  private tabButton(tab: LabTab): HTMLElement {
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
          this.render();
        },
      },
      t.lab.tabs[tab],
    );
  }

  private isMaster(): boolean {
    return this.deps.viewer().role === 'master';
  }

  // ---------- Recipes (master) ----------

  private renderRecipes(dialog: HTMLDialogElement): void {
    const { recipes } = this.deps.game.current.lab;
    this.header.replaceChildren(
      el('h2', { class: 'panel__title' }, t.lab.title),
      el(
        'div',
        { class: 'garden-header__tools' },
        button(t.lab.recipes.newRecipe, () => this.editRecipe(), { primary: true }),
        closeButton(t.lab.close, () => dialog.close()),
      ),
    );
    if (recipes.length === 0) {
      this.body.replaceChildren(el('p', { class: 'panel__hint' }, t.lab.recipes.empty));
      return;
    }
    this.body.replaceChildren(
      ...stationTypeSchema.options.flatMap((type) => this.recipeGroup(type, recipes)),
    );
  }

  private recipeGroup(type: StationType, recipes: readonly Recipe[]): HTMLElement[] {
    const ofType = recipes.filter((recipe) => recipe.stationType === type);
    if (ofType.length === 0) return [];
    return [
      el(
        'section',
        { class: 'lab-recipe-group' },
        el('h3', { class: 'garden-strip__title' }, t.lab.scene.stationTypes[type]),
        el('ul', { class: 'garden-crops' }, ...ofType.map((recipe) => this.recipeItem(recipe))),
      ),
    ];
  }

  private recipeItem(recipe: Recipe): HTMLElement {
    const { game } = this.deps;
    const state = game.current;
    const depot = this.snapshot();
    const name = (ref: StockRef) =>
      refName(ref, state, depot) ??
      (ref.source === 'depot' ? t.depot.stock.removed : t.lab.recipes.removedMaterial);
    const texts = t.lab.recipes;
    const ingredients = recipe.ingredients.map((i) => `${i.quantity} ${name(i.ref)}`).join(' + ');
    const refs = [recipe.output, ...recipe.ingredients.map((i) => i.ref)];
    const isBroken = refs.some((ref) => !refExists(ref, state, depot));
    return el(
      'li',
      { class: 'garden-crop' },
      potionIcon(game, recipe),
      el(
        'div',
        { class: 'garden-seed__info lab-recipe-item__info' },
        el(
          'strong',
          {},
          name(recipe.output),
          recipe.hidden && el('span', { class: 'lab-badge' }, t.lab.scene.hiddenBadge),
        ),
        isBroken && el('span', { class: 'panel__hint' }, texts.brokenLink),
        el('span', { class: 'panel__hint' }, ingredients),
        el('span', { class: 'panel__hint' }, texts.summary(recipe.days, recipe.outputQty)),
      ),
      el(
        'div',
        { class: 'row' },
        button(recipe.hidden ? texts.reveal : texts.hide, () => this.toggleHidden(recipe)),
        button(texts.edit, () => this.editRecipe(recipe)),
        confirmButton(
          texts.remove,
          () => void game.dispatch({ type: 'lab_recipe_remove', recipeId: recipe.id }),
          texts.removeAsk,
        ),
      ),
    );
  }

  private toggleHidden(recipe: Recipe): void {
    const { id, ...fields } = recipe;
    void this.deps.game.dispatch({
      type: 'lab_recipe_update',
      recipeId: id,
      recipe: { ...fields, hidden: !recipe.hidden },
    });
  }

  private editRecipe(recipe?: Recipe): void {
    const { game } = this.deps;
    openRecipeForm({
      state: game.current,
      ...(recipe ? { recipe } : {}),
      depot: this.deps.depot,
      save: (fields) => {
        const command: GameCommand = recipe
          ? { type: 'lab_recipe_update', recipeId: recipe.id, recipe: fields }
          : { type: 'lab_recipe_create', id: newId('recipe'), recipe: fields };
        return game.dispatch(command) === null;
      },
    });
  }

  /** The group depot as the rules see it; empty until the depot store loads. */
  private snapshot(): DepotSnapshot {
    return depotSnapshot(this.deps.depot?.current ?? EMPTY_DEPOT);
  }

  private recordCollect(view: ReadyView): void {
    const { output, outputQty } = view.brew;
    const key = refKey(output);
    const quantity = (this.collected.get(key)?.quantity ?? 0) + outputQty;
    this.collected.set(key, { output, quantity });
    this.renderStrip();
  }

  /** Potions of this visit, then every known ingredient in stock, materials and depot items alike. */
  private renderStrip(): void {
    const { game } = this.deps;
    const state = game.current;
    const depot = this.snapshot();
    const collected = [...this.collected].flatMap(([key, { output, quantity }]) => {
      const name = refName(output, state, depot);
      return name === undefined ? [] : [chip(potionIcon(game, { output }), name, quantity, key)];
    });
    const ingredients = this.knownIngredients().flatMap((ref) => {
      const name = refName(ref, state, depot);
      return name === undefined ? [] : [chip(null, name, refQuantity(ref, state, depot))];
    });
    this.strip.replaceChildren(
      stripSection(t.lab.scene.collectedTitle, collected, t.lab.scene.nothingCollected),
      stripSection(t.lab.scene.ingredientsTitle, ingredients, t.lab.scene.noIngredients),
    );
  }

  /** Ingredients of the recipes the viewer can see, each once. */
  private knownIngredients(): StockRef[] {
    const state = this.deps.game.current;
    const isMaster = this.deps.viewer().role === 'master';
    const types = ['alambique', 'caldeirao', 'circulo'] as const;
    const refs = types
      .flatMap((type) => recipesFor(state, type, isMaster, this.snapshot()))
      .flatMap((recipe) => recipe.ingredients.map((i) => i.ref));
    return [...new Map(refs.map((ref) => [refKey(ref), ref])).values()];
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
    const options = recipeOptions(game.current, view.station.type, {
      actor: viewer(),
      depot: this.snapshot(),
    });
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

/** `outputKey` marks a chip of the collected list as the target of the flying icons. */
function chip(
  icon: HTMLElement | null,
  name: string,
  quantity: number,
  outputKey?: string,
): HTMLElement {
  return el(
    'span',
    {
      class: quantity > 0 ? 'garden-chip' : 'garden-chip garden-chip--none',
      'data-output-id': outputKey,
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
