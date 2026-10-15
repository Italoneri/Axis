import { blockReasonText, t } from '../i18n/pt-BR';
import type { SlotType } from '../map/layout';
import { findBuilding, findSlot, GUILD_BUILDING_ID, TAVERN_BUILDING_ID } from '../model/catalog';
import type { BuildingDef, BuildingLevel, Cost, GameState, PlacedBuilding } from '../model/schema';
import {
  activeLevel,
  checkBuild,
  checkUpgrade,
  costInBronze,
  maxCountOf,
  placedCount,
  type BuildCheck,
} from '../systems/BuildSystem';
import { toBronze } from '../systems/Coins';
import { findMaterial } from '../systems/Materials';
import type { ArchiveStore } from '../archiveStore';
import type { DepotStore } from '../depotStore';
import { DEPOT_BUILDING_ID, depotCounts } from '../systems/Depot';
import { ARCHIVE_BUILDING_ID, archiveCounts } from '../systems/Archive';
import { missionTab } from '../systems/Missions';
import { RESEARCH_ARCHIVE_BUILDING_ID } from '../systems/Research';
import { constructionProgress } from '../systems/TimeSystem';
import type { GameStore } from '../store';
import { el, replaceKeepingScroll } from './dom';
import { buildingLabel, formatGold, textContext } from './format';
import type { MasterAccess } from './MasterSession';
import { renderMasterSlotControls } from './MasterSlotControls';
import { renderSlotNpcs } from './SlotNpcs';
import { abilityColumns, buildingDetails } from './buildingDetails';
import { ResearchArchive } from './resources/ResearchArchive';
import { button, thumb } from './widgets';

type SelectionListener = (slotId: string | null) => void;

/** Windows a building panel opens. */
export interface BuildingWindows {
  menu: () => void;
  missions: () => void;
}

/** The Depósito: its store (for the counts) and its window. */
export interface DepotAccess {
  store: DepotStore;
  open: () => void;
}

/** Side panel (bottom sheet on phones) showing what can be built in, or is built on, a slot. */
export class SlotPanel {
  private slotId: string | null = null;
  private renderedSlotId: string | null = null;
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly researchArchive = new ResearchArchive();
  /** Buildings whose "Detalhes" is open, so re-renders keep it open. */
  private readonly openDetails = new Set<string>();

  constructor(
    private readonly root: HTMLElement,
    private readonly store: GameStore,
    private readonly session: MasterAccess,
    private readonly archive: { store: ArchiveStore; open: () => void },
    private readonly windows: BuildingWindows,
    private readonly depot: DepotAccess,
  ) {
    store.subscribe(() => this.render());
    archive.store.subscribe(() => this.render());
    depot.store.subscribe(() => this.render());
    session.subscribe(() => this.render());
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.close();
    });
  }

  onSelectionChange(listener: SelectionListener): void {
    this.selectionListeners.add(listener);
  }

  open(slotId: string): void {
    this.slotId = slotId;
    this.render();
    this.selectionListeners.forEach((listener) => listener(slotId));
  }

  close(): void {
    if (this.slotId === null) return;
    this.slotId = null;
    this.render();
    this.selectionListeners.forEach((listener) => listener(null));
  }

  private render(): void {
    const slot = this.slotId === null ? undefined : findSlot(this.store.catalog, this.slotId);
    this.root.hidden = !slot;
    const sameView = slot !== undefined && slot.id === this.renderedSlotId;
    this.renderedSlotId = slot?.id ?? null;
    if (!slot) return;

    const state = this.store.current;
    const placed = state.slots[slot.id];
    const placedDef = placed && findBuilding(this.store.catalog, placed.buildingId);
    const title = placedDef
      ? buildingLabel(this.store.catalog, placedDef.id, slot.id)
      : t.panel.emptySlot(t.slotTypes[slot.type]);
    const body =
      placed && placedDef
        ? [
            ...this.renderOccupied(slot.id, placed, placedDef, state),
            ...renderSlotNpcs(this.store, slot.id),
            ...this.extraSections(placed, state),
          ]
        : this.renderEmpty(slot.id, slot.type, state);
    const masterControls =
      this.session.isActive && renderMasterSlotControls(this.store, slot, placed);

    replaceKeepingScroll(
      this.root,
      [
        el(
          'header',
          { class: 'panel__header' },
          el('h2', { class: 'panel__title' }, title),
          el(
            'button',
            {
              class: 'btn btn--icon',
              type: 'button',
              'aria-label': t.panel.close,
              onclick: () => this.close(),
            },
            '×',
          ),
        ),
        el('div', { class: 'panel__body' }, masterControls, ...body),
      ],
      { sameView, scroller: '.panel__body' },
    );
  }

  private renderEmpty(slotId: string, slotType: SlotType, state: GameState): HTMLElement[] {
    const options = this.store.catalog.buildings.filter((b) => b.allowedSlots.includes(slotType));
    if (options.length === 0) return [el('p', { class: 'panel__hint' }, t.panel.noOptions)];

    const cards = options.map((def) => {
      const check = checkBuild(state, this.store.catalog, { slotId, buildingId: def.id });
      const levelDef = def.levels[0];
      return el(
        'article',
        { class: check.ok ? 'card' : 'card card--blocked' },
        this.cardHead(def, def.description),
        maxCountOf(def) > 1 &&
          el(
            'p',
            { class: 'card__sub' },
            t.panel.copies(placedCount(state, def.id), maxCountOf(def)),
          ),
        levelDef && this.levelStats(levelDef, state),
        this.reasonList(check),
        this.details(def, 0, state),
        el(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            disabled: !check.ok,
            onclick: () => this.store.dispatch({ type: 'build', slotId, buildingId: def.id }),
          },
          t.panel.build,
        ),
      );
    });
    return [el('p', { class: 'panel__hint' }, t.panel.chooseBuilding), ...cards];
  }

  private renderOccupied(
    slotId: string,
    placed: PlacedBuilding,
    def: BuildingDef,
    state: GameState,
  ): HTMLElement[] {
    const activeLevelDef = def.levels[activeLevel(placed) - 1];
    const summary = this.cardHead(def, t.level(placed.level));
    const currentEffect = activeLevelDef
      ? el(
          'div',
          {},
          el('h3', { class: 'section-title' }, t.panel.currentEffect),
          abilityColumns(activeLevelDef),
        )
      : el('p', { class: 'panel__hint' }, t.panel.notYetActive);
    const details = this.details(def, activeLevel(placed), state);

    if (placed.status === 'building') {
      const progress = constructionProgress(placed, state.day);
      const heading =
        placed.level === 1
          ? t.panel.underConstruction(placed.level)
          : t.panel.upgrading(placed.level);
      return [
        el(
          'div',
          { class: 'card' },
          summary,
          el('h3', { class: 'section-title' }, heading),
          el(
            'div',
            {
              class: 'progress',
              role: 'progressbar',
              'aria-valuenow': String(Math.round(progress * 100)),
            },
            el('div', { class: 'progress__fill', style: `transform: scaleX(${progress})` }),
          ),
          el(
            'p',
            { class: 'stat' },
            t.panel.progress(placed.startedOnDay, placed.completesOnDay, state.day),
          ),
        ),
        el('div', { class: 'card' }, currentEffect, details),
      ];
    }

    const nextLevelDef = def.levels[placed.level];
    if (!nextLevelDef) {
      return [
        el(
          'div',
          { class: 'card' },
          summary,
          currentEffect,
          el('p', { class: 'panel__hint' }, t.panel.maxLevel),
          details,
        ),
      ];
    }
    const check = checkUpgrade(state, this.store.catalog, slotId);
    return [
      el('div', { class: 'card' }, summary, currentEffect, details),
      el(
        'div',
        { class: check.ok ? 'card' : 'card card--blocked' },
        el('h3', { class: 'section-title' }, t.panel.nextLevel(placed.level + 1)),
        this.levelStats(nextLevelDef, state),
        this.reasonList(check),
        el(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            disabled: !check.ok,
            onclick: () => this.store.dispatch({ type: 'upgrade', slotId }),
          },
          t.panel.upgrade,
        ),
      ),
    ];
  }

  private cardHead(def: BuildingDef, subtitle: string): HTMLElement {
    return el(
      'div',
      { class: 'card__head' },
      el('img', {
        class: 'card__icon',
        src: this.store.catalog.assets.images[def.icon] ?? '',
        alt: '',
      }),
      el(
        'div',
        {},
        el('h3', { class: 'card__name' }, def.name),
        el('p', { class: 'card__sub' }, subtitle),
      ),
    );
  }

  private levelStats(level: BuildingLevel, state: GameState): HTMLElement {
    return el(
      'div',
      {},
      el(
        'p',
        { class: 'stat' },
        el('span', { class: 'stat__label' }, t.panel.cost),
        this.costList(level.cost, state),
      ),
      this.stat(t.panel.time, level.buildTime === 0 ? t.instant : t.days(level.buildTime)),
      abilityColumns(level),
    );
  }

  private details(def: BuildingDef, currentLevel: number, state: GameState): HTMLElement {
    return buildingDetails({
      def,
      ctx: textContext(this.store.catalog, state),
      currentLevel,
      open: this.openDetails.has(def.id),
      onToggle: (open) => {
        if (open) this.openDetails.add(def.id);
        else this.openDetails.delete(def.id);
      },
      costOf: (level) => this.costList(level.cost, state),
    });
  }

  /** Coins are checked against the Acampamento; materials against the stock. */
  private costList(cost: Cost, state: GameState): HTMLElement {
    const { catalog } = this.store;
    const bronze = costInBronze(catalog, cost);
    const isCampShort = toBronze(state.wallets.camp, catalog.currencies) < bronze;
    const coins =
      bronze > 0 &&
      el(
        'span',
        { class: costItemClass(isCampShort), title: t.resources.gold },
        thumb(this.store, { image: 'icon.gold', name: t.resources.gold }),
        formatGold(catalog, bronze),
      );
    const materials = Object.entries(cost.materials ?? {}).map(([id, amount]) => {
      const material = findMaterial(state.materials, id);
      const name = material?.name ?? `${id} (indisponível)`;
      return el(
        'span',
        { class: costItemClass(!material || material.quantity < amount), title: name },
        thumb(this.store, { image: material?.icon, name: material?.name ?? '?' }),
        String(amount),
      );
    });
    return el('span', { class: 'cost' }, coins, ...materials);
  }

  private stat(label: string, value: string): HTMLElement {
    return el('p', { class: 'stat' }, el('span', { class: 'stat__label' }, label), value);
  }

  private reasonList(check: BuildCheck): HTMLElement | null {
    if (check.ok) return null;
    const ctx = textContext(this.store.catalog, this.store.current);
    return el(
      'ul',
      { class: 'reasons' },
      ...check.reasons.map((reason) => el('li', {}, blockReasonText(reason, ctx))),
    );
  }

  /** The Biblioteca shows every research in full once it has been built. */
  private extraSections(placed: PlacedBuilding, state: GameState): HTMLElement[] {
    if (activeLevel(placed) < 1) return [];
    if (placed.buildingId === RESEARCH_ARCHIVE_BUILDING_ID) {
      return [this.researchArchive.render(this.store.catalog, state)];
    }
    if (placed.buildingId === TAVERN_BUILDING_ID) return [this.menuSection()];
    if (placed.buildingId === GUILD_BUILDING_ID) return [this.missionsSection(state)];
    if (placed.buildingId === DEPOT_BUILDING_ID) return [this.depotSection()];
    return placed.buildingId === ARCHIVE_BUILDING_ID ? [this.recordsSection()] : [];
  }

  /** The Guilda, once built: the way into the mission board. */
  private missionsSection(state: GameState): HTMLElement {
    const tabs = state.missions.map(missionTab);
    const open = tabs.filter((tab) => tab === 'abertas').length;
    const active = tabs.filter((tab) => tab === 'andamento').length;
    return el(
      'section',
      { class: 'card' },
      el('h3', { class: 'section-title' }, t.missions.title),
      el('p', { class: 'panel__hint' }, t.missions.panelHint),
      el('p', {}, t.missions.counts(open, active)),
      button(t.missions.open, this.windows.missions, { primary: true }),
    );
  }

  /** The Taverna, once built: the way into the menu window. */
  private menuSection(): HTMLElement {
    return el(
      'section',
      { class: 'card' },
      el('h3', { class: 'section-title' }, t.menu.title),
      el('p', { class: 'panel__hint' }, t.menu.panelHint),
      button(t.menu.open, this.windows.menu, { primary: true }),
    );
  }

  /** The Depósito, once built: the way into its window. */
  private depotSection(): HTMLElement {
    const { sections, items } = depotCounts(this.depot.store.current);
    return el(
      'section',
      { class: 'card' },
      el('h3', { class: 'section-title' }, t.depot.title),
      el('p', { class: 'panel__hint' }, t.depot.panelHint),
      el('p', {}, t.depot.counts(sections, items)),
      button(t.depot.open, this.depot.open, { primary: true }),
    );
  }

  /** The Arquivo, once built: the way into the records window. */
  private recordsSection(): HTMLElement {
    const { topics, notes } = archiveCounts(this.archive.store.current);
    return el(
      'section',
      { class: 'card' },
      el('h3', { class: 'section-title' }, t.archive.title),
      el('p', { class: 'panel__hint' }, t.archive.panelHint),
      el('p', {}, t.archive.counts(topics, notes)),
      button(t.archive.open, this.archive.open, { primary: true }),
    );
  }
}

function costItemClass(isShort: boolean): string {
  return isShort ? 'cost__item cost__item--short' : 'cost__item';
}
