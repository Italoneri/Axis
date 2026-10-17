import type { Actor, GameCommand } from '../../commands/schema';
import type { Crop } from '../../model/schema';
import { plotLabel } from '../../i18n/plotLabel';
import { t } from '../../i18n/pt-BR';
import { artTextureKey, availableArtFiles, pickArtFile } from '../../map/buildingArt';
import type { GameStore } from '../../store';
import { fromBronze } from '../../systems/Coins';
import { gardenLevel, HERB_GARDEN_BUILDING_ID } from '../../systems/Garden';
import { el } from '../dom';
import { formatPrice } from '../format';
import type { MasterAccess } from '../MasterSession';
import { button, closeButton, confirmButton, keepEscapeInside } from '../widgets';
import { openCropForm } from './CropForm';
import {
  gardenSummary,
  visibleTabs,
  type GardenTab,
  plotViews,
  seedOptions,
  type PlotView,
  type SeedOption,
} from './gardenViews';

export interface GardenWindowDeps {
  game: GameStore;
  session: MasterAccess;
  viewer: () => Actor;
}

/**
 * "Estufa de Ervas": the building's art with one hotspot per plot, and a card
 * list of the same plots on narrow screens. It re-renders with the game, so
 * growth and other players' actions show up while the window is open.
 */
export class GardenWindow {
  private dialog: HTMLDialogElement | null = null;
  private stopWatching: (() => void) | null = null;
  private selectedPlotId: string | null = null;
  private tab: GardenTab = 'garden';
  private readonly header = el('header', { class: 'menu__header' });
  private readonly tabs = el('nav', { class: 'tabs garden-tabs', role: 'tablist' });
  private readonly body = el('div', { class: 'menu__body garden-body' });

  constructor(private readonly deps: GardenWindowDeps) {
    // Leaving the master tools hides the crops tab.
    deps.session.subscribe(() => this.render());
  }

  open(): void {
    if (this.dialog) return;
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.selectedPlotId = null;
    this.tab = 'garden';
    this.stopWatching = this.deps.game.subscribe(() => this.render());
    document.body.append(dialog);
    this.render();
    dialog.showModal();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--menu dialog--garden', 'aria-label': t.garden.title },
      this.header,
      this.tabs,
      this.body,
    );
    keepEscapeInside(dialog);
    dialog.addEventListener('close', () => {
      this.stopWatching?.();
      this.stopWatching = null;
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  private render(): void {
    const dialog = this.dialog;
    if (!dialog) return;
    const { game } = this.deps;
    const tabs = visibleTabs(this.isMaster());
    if (!tabs.includes(this.tab)) this.tab = 'garden';
    this.tabs.replaceChildren(...tabs.map((tab) => this.tabButton(tab)));
    if (this.tab === 'crops') {
      this.renderCrops(dialog);
      return;
    }
    const views = plotViews(game.current, game.catalog);
    if (!views.some((view) => view.plot.id === this.selectedPlotId)) this.selectedPlotId = null;
    const { ready } = gardenSummary(views);
    this.header.replaceChildren(
      el('h2', { class: 'panel__title' }, t.garden.title),
      el(
        'div',
        { class: 'garden-header__tools' },
        button(t.garden.harvestAll, () => this.send({ type: 'garden_harvest' }), {
          primary: true,
          disabled: ready === 0,
        }),
        closeButton(t.garden.close, () => dialog.close()),
      ),
    );
    this.body.replaceChildren(
      ...(views.length === 0 ? [el('p', { class: 'notice' }, t.garden.notBuilt)] : []),
      this.stage(views),
      el('ul', { class: 'garden-cards' }, ...views.map((view) => this.card(view))),
    );
  }

  private tabButton(tab: GardenTab): HTMLElement {
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
      t.garden.tabs[tab],
    );
  }

  private isMaster(): boolean {
    return this.deps.viewer().role === 'master';
  }

  private renderCrops(dialog: HTMLDialogElement): void {
    const { crops } = this.deps.game.current.garden;
    this.header.replaceChildren(
      el('h2', { class: 'panel__title' }, t.garden.title),
      el(
        'div',
        { class: 'garden-header__tools' },
        button(t.garden.crops.newCrop, () => this.editCrop(), { primary: true }),
        closeButton(t.garden.close, () => dialog.close()),
      ),
    );
    this.body.replaceChildren(
      crops.length === 0
        ? el('p', { class: 'panel__hint' }, t.garden.crops.empty)
        : el('ul', { class: 'garden-crops' }, ...crops.map((crop) => this.cropRow(crop))),
    );
  }

  private cropRow(crop: Crop): HTMLElement {
    const { game } = this.deps;
    const name = (id: string) =>
      game.current.materials.items.find((material) => material.id === id)?.name ??
      t.garden.crops.removedMaterial;
    return el(
      'li',
      { class: 'garden-crop' },
      el(
        'div',
        { class: 'garden-seed__info' },
        el('strong', {}, `${name(crop.seedId)} → ${name(crop.harvestId)}`),
        el(
          'span',
          { class: 'panel__hint' },
          [
            t.garden.crops.plotTypes[crop.plotType],
            t.garden.growDays(crop.days),
            t.garden.yields(crop.yield, name(crop.harvestId)),
            crop.rare ? t.garden.rareBadge : formatPrice(game.catalog, crop.price),
          ].join(' · '),
        ),
      ),
      el(
        'div',
        { class: 'row' },
        button(t.garden.crops.edit, () => this.editCrop(crop)),
        confirmButton(
          t.garden.crops.remove,
          () => void game.dispatch({ type: 'garden_crop_remove', seedId: crop.seedId }),
        ),
      ),
    );
  }

  private editCrop(crop?: Crop): void {
    const { game } = this.deps;
    openCropForm({
      state: game.current,
      catalog: game.catalog,
      ...(crop ? { crop } : {}),
      save: (next) => {
        const { seedId, ...fields } = next;
        const command: GameCommand = crop
          ? { type: 'garden_crop_update', seedId, crop: fields }
          : { type: 'garden_crop_create', crop: next };
        return game.dispatch(command) === null;
      },
    });
  }

  private stage(views: readonly PlotView[]): HTMLElement {
    const art = this.artUrl();
    const selected = views.find((view) => view.plot.id === this.selectedPlotId);
    return el(
      'div',
      { class: 'garden-stage' },
      art && el('img', { class: 'garden-stage__art', src: art, alt: '' }),
      ...views.map((view) => this.hotspot(view)),
      selected && this.popover(selected, this.plotPanel(selected)),
    );
  }

  /** The same art file the map draws for the level in force. */
  private artUrl(): string | undefined {
    const { catalog, current } = this.deps.game;
    const file = pickArtFile(
      availableArtFiles(catalog.assets.images),
      HERB_GARDEN_BUILDING_ID,
      'outer',
      gardenLevel(current),
    );
    return file === undefined ? undefined : catalog.assets.images[artTextureKey(file)];
  }

  private hotspot(view: PlotView): HTMLElement {
    const { plot } = view;
    const percent = (fraction: number) => `${fraction * 100}%`;
    return el('button', {
      class: `garden-plot garden-plot--${plot.type} garden-plot--${view.kind}`,
      type: 'button',
      style: `left:${percent(plot.x)};top:${percent(plot.y)};width:${percent(plot.w)};height:${percent(plot.h)}`,
      'aria-label': `${plotLabel(plot.id)}: ${this.stateText(view)}`,
      'aria-expanded': String(plot.id === this.selectedPlotId),
      onclick: () => this.toggle(plot.id),
    });
  }

  /** Opens below the plot in the upper half of the art, above it in the lower half. */
  private popover({ plot }: PlotView, panel: HTMLElement): HTMLElement {
    const opensBelow = plot.y + plot.h / 2 < 0.55;
    const left = Math.min(Math.max(plot.x + plot.w / 2, 0.22), 0.78);
    const anchor = opensBelow ? `top:${(plot.y + plot.h) * 100}%` : `bottom:${(1 - plot.y) * 100}%`;
    return el(
      'div',
      { class: 'garden-popover', style: `left:${left * 100}%;${anchor}`, role: 'dialog' },
      panel,
    );
  }

  private card(view: PlotView): HTMLElement {
    const { plot } = view;
    const isOpen = plot.id === this.selectedPlotId;
    return el(
      'li',
      { class: `garden-card garden-card--${view.kind}` },
      el(
        'button',
        {
          class: 'garden-card__head',
          type: 'button',
          'aria-expanded': String(isOpen),
          onclick: () => this.toggle(plot.id),
        },
        el('strong', {}, plotLabel(plot.id)),
        el('span', { class: 'panel__hint' }, this.stateText(view)),
      ),
      isOpen && el('div', { class: 'garden-card__panel' }, this.plotPanel(view)),
    );
  }

  private stateText(view: PlotView): string {
    switch (view.kind) {
      case 'empty':
        return t.garden.empty;
      case 'growing':
        return `${view.harvestName} · ${t.garden.daysLeft(view.daysLeft)}`;
      case 'ready':
        return `${view.harvestName} · ${t.garden.ready}`;
    }
  }

  private plotPanel(view: PlotView): HTMLElement {
    const heading = el(
      'div',
      { class: 'garden-panel__head' },
      el('h3', { class: 'section-title' }, plotLabel(view.plot.id)),
      closeButton(t.garden.closePopover, () => this.toggle(view.plot.id)),
    );
    switch (view.kind) {
      case 'empty':
        return el('div', { class: 'garden-panel' }, heading, this.seedList(view));
      case 'growing':
        return el(
          'div',
          { class: 'garden-panel' },
          heading,
          el('p', {}, t.garden.yields(view.crop.yield, view.harvestName)),
          progressBar(view.progress),
          el('p', { class: 'panel__hint' }, t.garden.daysLeft(view.daysLeft)),
          this.clearButton(view),
        );
      case 'ready':
        return el(
          'div',
          { class: 'garden-panel' },
          heading,
          el('p', {}, t.garden.yields(view.crop.yield, view.harvestName)),
          el(
            'div',
            { class: 'row' },
            button(
              t.garden.harvest,
              () => this.send({ type: 'garden_harvest', plotId: view.plot.id }),
              { primary: true },
            ),
            this.clearButton(view),
          ),
        );
    }
  }

  private clearButton(view: PlotView): HTMLElement {
    return confirmButton(t.garden.clear, () =>
      this.send({ type: 'garden_clear', plotId: view.plot.id }),
    );
  }

  private seedList(view: PlotView): HTMLElement {
    const { game } = this.deps;
    const options = seedOptions(game.current, game.catalog, view.plot.type, this.deps.viewer());
    if (options.length === 0) return el('p', { class: 'panel__hint' }, t.garden.noSeeds);
    return el(
      'ul',
      { class: 'garden-seeds', 'aria-label': t.garden.chooseSeed },
      ...options.map((option) => this.seedRow(view, option)),
    );
  }

  private seedRow(view: PlotView, option: SeedOption): HTMLElement {
    return el(
      'li',
      { class: 'garden-seed' },
      el(
        'div',
        { class: 'garden-seed__info' },
        el(
          'strong',
          {},
          option.seedName,
          option.crop.rare && el('span', { class: 'garden-seed__badge' }, t.garden.rareBadge),
        ),
        el(
          'span',
          { class: 'panel__hint' },
          [
            t.garden.seedsOwned(option.owned),
            t.garden.growDays(option.crop.days),
            t.garden.yields(option.crop.yield, option.harvestName),
          ].join(' · '),
        ),
      ),
      this.seedButton(view, option),
    );
  }

  private seedButton(view: PlotView, option: SeedOption): HTMLElement {
    const plantWith = (buy: boolean) =>
      this.send({
        type: 'garden_plant',
        plotId: view.plot.id,
        seedId: option.crop.seedId,
        buy,
      });
    switch (option.action) {
      case 'plant':
        return button(t.garden.plant, () => plantWith(false), { primary: true });
      case 'buy':
        return button(t.garden.buyAndPlant(this.priceText(option.priceBronze)), () =>
          plantWith(true),
        );
      case 'rare_locked':
        return button(t.garden.rareHint, () => undefined, { disabled: true });
      case 'camp_short':
        return button(t.garden.campShort(this.priceText(option.shortBronze)), () => undefined, {
          disabled: true,
        });
    }
  }

  private priceText(bronze: number | null): string {
    const { catalog } = this.deps.game;
    return formatPrice(catalog, fromBronze(bronze ?? 0, catalog.currencies));
  }

  private toggle(plotId: string): void {
    this.selectedPlotId = this.selectedPlotId === plotId ? null : plotId;
    this.render();
  }

  /** Refusals are toasted by the store; the popover only closes once the command went through. */
  private send(command: GameCommand): void {
    if (this.deps.game.dispatch(command) !== null) return;
    this.selectedPlotId = null;
    this.render();
  }
}

function progressBar(progress: number): HTMLElement {
  return el(
    'div',
    {
      class: 'garden-bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(Math.round(progress * 100)),
    },
    el('span', { class: 'garden-bar__fill', style: `width:${progress * 100}%` }),
  );
}
