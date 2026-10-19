import type { Actor, GameCommand } from '../../commands/schema';
import { stationLabel } from '../../i18n/stationLabel';
import { t } from '../../i18n/pt-BR';
import type { StationDef, StationType } from '../../model/schema';
import type { GameStore } from '../../store';
import { labLevel } from '../../systems/Lab';
import { findMaterial } from '../../systems/Materials';
import { el } from '../dom';
import { popoverPosition, type Rect } from '../garden/sceneLayout';
import { button, closeButton, pictureOr } from '../widgets';
import { brewStage, liquidColor, stationSignature } from './labSceneLayout';
import {
  lockedStations,
  recipeOptions,
  stationAria,
  type LockedStation,
  type RecipeOption,
  type StationView,
} from './labViews';

export type ReadyView = Extract<StationView, { kind: 'ready' }>;
type BrewingView = Extract<StationView, { kind: 'brewing' }>;
type FreeView = Extract<StationView, { kind: 'free' }>;

export interface LabSceneDeps {
  game: GameStore;
  viewer: () => Actor;
  /** Runs once per station after a collect went through, before its icons fly. */
  onCollect: (view: ReadyView) => void;
  /** The chip the collected icons fly to (it bumps when they land). */
  collectTarget: (outputId: string) => HTMLElement | null;
  /** The Estufa is built, so a missing herb can be planted there. */
  gardenBuilt: () => boolean;
  openGarden: () => void;
}

interface StationEntry {
  button: HTMLButtonElement;
  view: StationView;
  signature: string;
}

interface Popover {
  stationId: string;
  node: HTMLElement;
  signature: string;
}

const COLLECT_STAGGER_MS = 140;
const READY_POP_MS = 600;
const FLOAT_TEXT_MS = 1150;
const BUBBLES = 4;
const RUNES = ['ᚠ', 'ᚱ', 'ᛟ', 'ᛉ', 'ᚦ', 'ᛞ', 'ᚨ', 'ᛗ'];
const SPARKS: readonly [number, number][] = [
  [10, 18],
  [86, 26],
  [26, 82],
  [74, 74],
];

const percent = (fraction: number) => `${fraction * 100}%`;
const boxStyle = ({ x, y, w, h }: Rect) =>
  `left:${percent(x)};top:${percent(y)};width:${percent(w)};height:${percent(h)}`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The lab workshop drawn in code: a stone floor under shelves of bottles and
 * candles, one button per brewing station, and a popover to pick a recipe or
 * to discard a brew. `update` only redraws stations whose drawing changed, so
 * the bubbles of the others keep going while the game re-renders.
 */
export class LabScene {
  readonly root = el('div', { class: 'lab-scene', role: 'group', 'aria-label': t.lab.scene.label });
  private readonly locked = el('div', { class: 'lab-scenery', 'aria-hidden': 'true' });
  private readonly entries = new Map<string, StationEntry>();
  private lockedLevel: number | null = null;
  private popover: Popover | null = null;

  constructor(private readonly deps: LabSceneDeps) {
    this.root.append(staticScenery(), this.locked);
  }

  update(views: readonly StationView[]): void {
    this.drawLocked(labLevel(this.deps.game.current));
    const inForce = new Set(views.map((view) => view.station.id));
    [...this.entries]
      .filter(([stationId]) => !inForce.has(stationId))
      .forEach(([stationId, entry]) => {
        entry.button.remove();
        this.entries.delete(stationId);
      });
    views.forEach((view) => this.drawStation(view));
    this.refreshPopover();
  }

  collectAll(): void {
    const ready = [...this.entries.values()]
      .map((entry) => entry.view)
      .filter((view): view is ReadyView => view.kind === 'ready');
    if (ready.length === 0) return;
    this.closePopover();
    this.collect(ready, { type: 'lab_collect' });
  }

  hasPopover(): boolean {
    return this.popover !== null;
  }

  closePopover(): void {
    const popover = this.popover;
    if (!popover) return;
    popover.node.remove();
    this.entries.get(popover.stationId)?.button.setAttribute('aria-expanded', 'false');
    this.popover = null;
  }

  // ---------- Scenery and stations ----------

  private drawLocked(level: number): void {
    if (level === this.lockedLevel) return;
    this.lockedLevel = level;
    const levels = this.deps.game.catalog.lab.levels;
    this.locked.replaceChildren(...lockedStations(levels, level).map(lockedNode));
  }

  private drawStation(view: StationView): void {
    const entry = this.entries.get(view.station.id) ?? this.createStation(view.station);
    const signature = `${stationSignature(view)}|${this.potionPicture(view)}`;
    const becameReady = entry.view.kind === 'brewing' && view.kind === 'ready';
    entry.view = view;
    if (entry.signature === signature) return;
    entry.signature = signature;
    const { button: node } = entry;
    node.replaceChildren(stationBase(view), ...this.badges(view));
    node.dataset.stage = brewStage(view);
    node.setAttribute('aria-label', stationAria(view));
    if (becameReady) flashClass(node, 'is-popping', READY_POP_MS);
  }

  private createStation(station: StationDef): StationEntry {
    const node = el('button', {
      class: `lab-station lab-station--${station.type}`,
      type: 'button',
      style: boxStyle(station),
      'data-station-id': station.id,
      'aria-expanded': 'false',
    });
    node.addEventListener('click', () => this.onStationClick(station.id));
    this.root.insertBefore(node, this.popover?.node ?? null);
    const entry: StationEntry = { button: node, view: { kind: 'free', station }, signature: '' };
    this.entries.set(station.id, entry);
    return entry;
  }

  private onStationClick(stationId: string): void {
    const view = this.entries.get(stationId)?.view;
    if (!view) return;
    if (view.kind === 'ready') {
      this.closePopover();
      this.collect([view], { type: 'lab_collect', stationId });
      return;
    }
    if (this.popover?.stationId === stationId) this.closePopover();
    else this.openPopover(stationId);
  }

  // ---------- Commands ----------

  private collect(views: readonly ReadyView[], command: GameCommand): void {
    if (this.deps.game.dispatch(command) !== null) return;
    views.forEach((view, i) => {
      this.deps.onCollect(view);
      setTimeout(() => this.celebrate(view), i * COLLECT_STAGGER_MS);
    });
  }

  private brew(stationId: string, recipeId: string): void {
    const command: GameCommand = { type: 'lab_brew', stationId, recipeId };
    if (this.deps.game.dispatch(command) === null) this.closePopover();
  }

  private discard(stationId: string): void {
    if (this.deps.game.dispatch({ type: 'lab_discard', stationId }) === null) this.closePopover();
  }

  // ---------- Popover ----------

  private openPopover(stationId: string): void {
    this.closePopover();
    this.popover = { stationId, node: el('div'), signature: '' };
    this.entries.get(stationId)?.button.setAttribute('aria-expanded', 'true');
    this.refreshPopover();
    this.popover?.node
      .querySelector<HTMLElement>('.btn--primary:not(:disabled), .btn')
      ?.focus({ preventScroll: true });
  }

  /** Rebuilt only when what it shows changed. */
  private refreshPopover(): void {
    const popover = this.popover;
    if (!popover) return;
    const view = this.entries.get(popover.stationId)?.view;
    if (!view || view.kind === 'ready') {
      this.closePopover();
      return;
    }
    const options = view.kind === 'free' ? this.optionsFor(view.station.type) : [];
    const signature = `${stationSignature(view)}|${this.deps.gardenBuilt()}|${JSON.stringify(
      options.map((o) => [o.recipe, o.outputName, o.ingredients, o.canBrew]),
    )}`;
    if (signature === popover.signature) return;
    const node = view.kind === 'free' ? this.recipeTray(view, options) : this.brewingPanel(view);
    if (popover.node.isConnected) popover.node.replaceWith(node);
    else this.root.append(node);
    this.popover = { stationId: popover.stationId, node, signature };
    this.place(node, view.station);
  }

  private place(node: HTMLElement, station: Rect): void {
    const scene = { width: this.root.clientWidth, height: this.root.clientHeight };
    const size = { width: node.offsetWidth, height: node.offsetHeight };
    const { left, top } = popoverPosition(station, scene, size);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  private optionsFor(stationType: StationType): RecipeOption[] {
    return recipeOptions(this.deps.game.current, stationType, this.deps.viewer());
  }

  private recipeTray(view: FreeView, options: readonly RecipeOption[]): HTMLElement {
    const label = stationLabel(view.station.id);
    return popoverShell(
      t.lab.scene.brewIn(label),
      () => this.closePopover(),
      el('h3', { class: 'garden-pop__title' }, label),
      options.length === 0
        ? el('p', {}, t.lab.scene.noRecipes)
        : el('p', {}, t.lab.scene.chooseRecipe),
      options.length > 0 &&
        el(
          'ul',
          { class: 'lab-recipes' },
          ...options.map((option) =>
            recipeRow(this.deps.game, option, () => this.brew(view.station.id, option.recipe.id)),
          ),
        ),
      this.gardenHint(options),
    );
  }

  /** Shown when a missing ingredient grows in the Estufa. */
  private gardenHint(options: readonly RecipeOption[]): HTMLElement | false {
    const growable = options.some((o) => o.ingredients.some((i) => i.missing && i.fromGarden));
    if (!growable) return false;
    return el(
      'div',
      { class: 'lab-pop__garden' },
      el('span', {}, t.lab.scene.plantHint),
      this.deps.gardenBuilt() && button(t.lab.scene.openGarden, this.deps.openGarden),
    );
  }

  private brewingPanel(view: BrewingView): HTMLElement {
    const label = stationLabel(view.station.id);
    return popoverShell(
      t.lab.scene.brewingIn(view.potionName, label),
      () => this.closePopover(),
      el('h3', { class: 'garden-pop__title' }, view.potionName),
      el('p', {}, `${label} · ${t.lab.scene.readyIn(view.daysLeft, view.brew.outputQty)}`),
      progressBar(view.progress),
      discardActions(() => this.discard(view.station.id)),
    );
  }

  // ---------- Station badges ----------

  private badges(view: StationView): HTMLElement[] {
    switch (view.kind) {
      case 'free':
        return [];
      case 'brewing':
        return [
          el(
            'span',
            { class: 'garden-status' },
            el(
              'span',
              { class: 'garden-status__bar' },
              el('i', { style: `width:${view.progress * 100}%` }),
            ),
            t.lab.scene.daysShort(view.daysLeft),
          ),
        ];
      case 'ready':
        return [
          el(
            'span',
            { class: 'garden-bubble lab-bubble-ready' },
            potionIcon(this.deps.game, view.brew),
          ),
          ...SPARKS.map(([x, y], i) =>
            el('span', {
              class: 'garden-spark',
              style: `left:${x}%;top:${y}%;animation-delay:${i * 0.45}s`,
            }),
          ),
        ];
    }
  }

  /** Part of the station's signature: the bubble shows the potion's picture. */
  private potionPicture(view: StationView): string {
    if (view.kind === 'free') return '';
    return findMaterial(this.deps.game.current.materials, view.brew.outputId)?.icon ?? '';
  }

  // ---------- Effects ----------

  private celebrate(view: ReadyView): void {
    const text = t.lab.scene.collected(view.brew.outputQty, view.potionName);
    this.floatText(view.station, text);
    if (!reducedMotion()) this.flyIcons(view);
  }

  private floatText(station: Rect, text: string): void {
    const node = el(
      'span',
      {
        class: 'garden-fx-text lab-fx-text',
        style: `left:${percent(station.x + station.w / 2)};top:${percent(station.y + station.h / 2 - 0.08)}`,
      },
      text,
    );
    this.root.append(node);
    setTimeout(() => node.remove(), FLOAT_TEXT_MS);
  }

  private flyIcons(view: ReadyView): void {
    const from = this.entries.get(view.station.id)?.button;
    const to = this.deps.collectTarget(view.brew.outputId);
    if (!from || !to) return;
    const [x0, y0] = centerOf(from);
    const [x1, y1] = centerOf(to);
    [0, 1, 2].forEach((i) => {
      // Wrapped: a photo still loading swaps the sprite inside, not the node in flight.
      const icon = el('span', { class: 'garden-fx-fly' }, potionIcon(this.deps.game, view.brew));
      icon.style.left = `${x0 - 17}px`;
      icon.style.top = `${y0 - 17}px`;
      this.overlay().append(icon);
      const midX = (x1 - x0) * 0.4 + (i - 1) * 30;
      const midY = Math.min(y0, y1) - 80 - y0;
      const flight = icon.animate(
        [
          { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
          { transform: `translate(${midX}px, ${midY}px) scale(1.15)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${x1 - x0}px, ${y1 - y0}px) scale(0.5)`, opacity: 0.9 },
        ],
        { duration: 750 + i * 90, easing: 'cubic-bezier(.45,0,.3,1)', delay: i * 70 },
      );
      flight.onfinish = () => {
        icon.remove();
        if (i === 2) this.bump(view.brew.outputId);
      };
    });
  }

  /** Looked up again: the strip may have been redrawn while the icons flew. */
  private bump(outputId: string): void {
    const target = this.deps.collectTarget(outputId);
    if (target) flashClass(target, 'is-bumping', 400);
  }

  /** Inside the modal dialog: anything appended to body would sit under its top layer. */
  private overlay(): HTMLElement {
    return this.root.closest('dialog') ?? document.body;
  }
}

// ---------- Drawing ----------

/** The back wall with shelves of bottles and two candles, the same at every level. */
function staticScenery(): HTMLElement {
  const bottles = (count: number, offset: number) =>
    Array.from({ length: count }, (_, i) =>
      el('span', {
        class: 'lab-bottle',
        style: `--h:${(offset + i * 47) % 360}deg;--tall:${0.7 + ((i * 37 + offset) % 5) / 10}`,
      }),
    );
  const shelf = (box: Rect, count: number, offset: number) =>
    el('div', { class: 'lab-shelf', style: boxStyle(box) }, ...bottles(count, offset));
  const candle = (x: number) =>
    el('div', { class: 'lab-candle', style: `left:${percent(x)}` }, el('i'));
  return el(
    'div',
    { class: 'lab-scenery', 'aria-hidden': 'true' },
    el('div', { class: 'lab-wall' }),
    shelf({ x: 0.04, y: 0.035, w: 0.38, h: 0.09 }, 9, 20),
    shelf({ x: 0.58, y: 0.035, w: 0.38, h: 0.09 }, 9, 170),
    candle(0.47),
    candle(0.515),
    el('div', { class: 'lab-glow' }),
  );
}

function lockedNode({ station, level }: LockedStation): HTMLElement {
  return el(
    'div',
    { class: 'garden-locked lab-locked', style: boxStyle(station) },
    t.lab.scene.locked(t.lab.scene.stationTypes[station.type], level),
  );
}

const bubbles = () =>
  el(
    'span',
    { class: 'lab-bubbles' },
    ...Array.from({ length: BUBBLES }, (_, i) => el('i', { style: `--i:${i}` })),
  );
const steam = () => el('span', { class: 'lab-steam' }, el('i'), el('i'));

const STATION_PARTS: Record<StationType, () => HTMLElement[]> = {
  alambique: () => [
    el('span', { class: 'lab-table' }),
    el('span', { class: 'lab-coil' }),
    el('span', { class: 'lab-burner' }),
    el('span', { class: 'lab-flask' }, el('span', { class: 'lab-liquid' }), bubbles()),
    steam(),
  ],
  caldeirao: () => [
    el('span', { class: 'lab-embers' }),
    el('span', { class: 'lab-cauldron' }, el('span', { class: 'lab-liquid' }), bubbles()),
    steam(),
  ],
  circulo: () => [
    el(
      'span',
      { class: 'lab-circle' },
      el(
        'span',
        { class: 'lab-runes' },
        ...RUNES.map((rune, i) => el('i', { style: `--a:${(i * 360) / RUNES.length}deg` }, rune)),
      ),
    ),
    el('span', { class: 'lab-orb' }, el('span', { class: 'lab-liquid' })),
  ],
};

function stationBase(view: StationView): HTMLElement {
  const liquid = view.kind === 'free' ? '' : `--liquid:${liquidColor(view.brew)}`;
  return el(
    'span',
    { class: 'lab-station__base', style: liquid },
    ...STATION_PARTS[view.station.type](),
  );
}

/** The potion's picture, or a little flask of its liquid color while it has none. */
export function potionIcon(
  game: GameStore,
  { outputId, color }: { outputId: string; color?: string | undefined },
): HTMLElement {
  const picture = findMaterial(game.current.materials, outputId)?.icon;
  return pictureOr(game, picture, 'lab-icon lab-icon--photo', () =>
    el('span', {
      class: 'lab-icon lab-icon--flask',
      style: `--liquid:${liquidColor({ outputId, color })}`,
    }),
  );
}

/** One recipe in the tray (and in the narrow-screen cards). */
export function recipeRow(game: GameStore, option: RecipeOption, onBrew: () => void): HTMLElement {
  const { recipe } = option;
  return el(
    'li',
    { class: 'lab-recipe' },
    potionIcon(game, recipe),
    el(
      'div',
      { class: 'lab-recipe__info' },
      el(
        'strong',
        {},
        option.outputName,
        option.hidden && el('span', { class: 'lab-badge' }, t.lab.scene.hiddenBadge),
      ),
      el(
        'span',
        { class: 'lab-recipe__meta' },
        `${t.lab.brewDays(recipe.days)} · ${t.lab.yields(recipe.outputQty)}`,
      ),
      el(
        'span',
        { class: 'lab-recipe__ingredients' },
        ...option.ingredients.map((ingredient) =>
          el(
            'span',
            { class: ingredient.missing ? 'lab-ingredient is-missing' : 'lab-ingredient' },
            `${ingredient.name} ${t.lab.scene.have(ingredient.have, ingredient.need)}`,
            ingredient.fromGarden &&
              el('span', { class: 'lab-badge lab-badge--garden' }, t.lab.scene.gardenBadge),
          ),
        ),
      ),
    ),
    button(t.lab.brew, onBrew, {
      primary: true,
      disabled: !option.canBrew,
      ...(option.canBrew ? {} : { title: t.lab.missing(option.missing) }),
    }),
  );
}

/** "Descartar" asks in place: the ingredients do not come back. */
export function discardActions(onDiscard: () => void): HTMLElement {
  const actions = el('div', { class: 'row garden-pop__actions' });
  const discardButton = (): HTMLElement =>
    el('button', { class: 'btn btn--danger', type: 'button', onclick: ask }, t.lab.discard);
  const ask = () =>
    actions.replaceChildren(
      el('span', { class: 'garden-pop__ask' }, t.lab.scene.discardAsk),
      el('button', { class: 'btn btn--danger', type: 'button', onclick: onDiscard }, t.lab.discard),
      button(t.lab.scene.cancel, () => actions.replaceChildren(discardButton())),
    );
  actions.append(discardButton());
  return actions;
}

function popoverShell(
  label: string,
  onClose: () => void,
  ...children: (HTMLElement | false)[]
): HTMLElement {
  return el(
    'div',
    { class: 'garden-pop lab-pop', role: 'dialog', 'aria-label': label },
    closeButton(t.lab.closePopover, onClose),
    ...children,
  );
}

export function progressBar(progress: number): HTMLElement {
  const value = Math.round(progress * 100);
  return el(
    'div',
    {
      class: 'garden-pop__bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': String(value),
    },
    el('i', { style: `width:${value}%` }),
  );
}

function centerOf(node: Element): [number, number] {
  const box = node.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

/** Restarts a one-shot CSS animation class. */
function flashClass(node: HTMLElement, className: string, ms: number): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), ms);
}
