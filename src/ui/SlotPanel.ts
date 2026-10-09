import { blockReasonText, t } from '../i18n/pt-BR';
import type { SlotType } from '../map/layout';
import { findBuilding, findSlot } from '../model/catalog';
import type { BuildingDef, BuildingLevel, Cost, GameState, PlacedBuilding } from '../model/schema';
import {
  activeLevel,
  checkBuild,
  checkUpgrade,
  costInBronze,
  type BuildCheck,
} from '../systems/BuildSystem';
import { toBronze } from '../systems/Coins';
import { findMaterial } from '../systems/Materials';
import { STUDY_STATION_ID } from '../systems/Research';
import { constructionProgress } from '../systems/TimeSystem';
import type { GameStore } from '../store';
import { el, replaceKeepingScroll } from './dom';
import { formatGold, textContext } from './format';
import type { MasterSession } from './MasterSession';
import { renderMasterSlotControls } from './MasterSlotControls';
import { ResearchArchive } from './resources/ResearchArchive';
import { thumb } from './widgets';

type SelectionListener = (slotId: string | null) => void;

/** Side panel (bottom sheet on phones) showing what can be built in, or is built on, a slot. */
export class SlotPanel {
  private slotId: string | null = null;
  private renderedSlotId: string | null = null;
  private readonly selectionListeners = new Set<SelectionListener>();
  private readonly researchArchive = new ResearchArchive();

  constructor(
    private readonly root: HTMLElement,
    private readonly store: GameStore,
    private readonly session: MasterSession,
  ) {
    store.subscribe(() => this.render());
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
    const title = placedDef ? placedDef.name : t.panel.emptySlot(t.slotTypes[slot.type]);
    const body =
      placed && placedDef
        ? [
            ...this.renderOccupied(slot.id, placed, placedDef, state),
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
        levelDef && this.levelStats(levelDef, state),
        this.reasonList(check),
        el(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            disabled: !check.ok,
            onclick: () => this.store.build({ slotId, buildingId: def.id }),
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
      ? this.stat(t.panel.currentEffect, activeLevelDef.effect)
      : el('p', { class: 'panel__hint' }, t.panel.notYetActive);

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
        el('div', { class: 'card' }, currentEffect),
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
        ),
      ];
    }
    const check = checkUpgrade(state, this.store.catalog, slotId);
    return [
      el('div', { class: 'card' }, summary, currentEffect),
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
            onclick: () => this.store.upgrade(slotId),
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
      this.stat(t.panel.effect, level.effect),
    );
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
        thumb(catalog, { image: 'icon.gold', name: t.resources.gold }),
        formatGold(catalog, bronze),
      );
    const materials = Object.entries(cost.materials ?? {}).map(([id, amount]) => {
      const material = findMaterial(state.materials, id);
      const name = material?.name ?? `${id} (indisponível)`;
      return el(
        'span',
        { class: costItemClass(!material || material.quantity < amount), title: name },
        thumb(catalog, { image: material?.icon, name: material?.name ?? '?' }),
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

  /** The study station shows every research in full once it has been built. */
  private extraSections(placed: PlacedBuilding, state: GameState): HTMLElement[] {
    const hasArchive = placed.buildingId === STUDY_STATION_ID && activeLevel(placed) >= 1;
    return hasArchive ? [this.researchArchive.render(this.store.catalog, state)] : [];
  }
}

function costItemClass(isShort: boolean): string {
  return isShort ? 'cost__item cost__item--short' : 'cost__item';
}
