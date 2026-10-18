import type { Actor, GameCommand } from '../../commands/schema';
import { plotLabel } from '../../i18n/plotLabel';
import { t } from '../../i18n/pt-BR';
import { resolveImage } from '../../model/catalog';
import type { PlotDef, PlotType } from '../../model/schema';
import type { GameStore } from '../../store';
import { fromBronze } from '../../systems/Coins';
import { findCrop, gardenLevel } from '../../systems/Garden';
import { el } from '../dom';
import { formatPrice } from '../format';
import { button, closeButton } from '../widgets';
import {
  cropLook,
  GARDEN_ART_DIR,
  gardenScenery,
  plantSpots,
  plantStage,
  plantTufts,
  plotSignature,
  popoverPosition,
  type Rect,
  type SceneryPiece,
  type Tuft,
} from './sceneLayout';
import { seedOptions, type PlotView, type SeedOption } from './gardenViews';

export type ReadyView = Extract<PlotView, { kind: 'ready' }>;
type GrowingView = Extract<PlotView, { kind: 'growing' }>;
type EmptyView = Extract<PlotView, { kind: 'empty' }>;

export interface GardenSceneDeps {
  game: GameStore;
  viewer: () => Actor;
  /** Runs once per plot after a harvest went through, before its icons fly. */
  onHarvest: (view: ReadyView) => void;
  /** The chip the harvested icons fly to (it bumps when they land). */
  harvestTarget: (harvestId: string) => HTMLElement | null;
}

interface PlotEntry {
  button: HTMLButtonElement;
  view: PlotView;
  signature: string;
}

interface Popover {
  plotId: string;
  node: HTMLElement;
  signature: string;
}

interface GestureBase {
  pointerId: number;
  ghost: HTMLElement;
  /** Detaches the move/up listeners. */
  stop: AbortController;
}

type Gesture =
  | (GestureBase & { kind: 'harvest' })
  | (GestureBase & {
      kind: 'plant';
      seedId: string;
      originPlotId: string;
      start: { x: number; y: number };
      moved: boolean;
      planted: number;
      /** A refused plant ends the sowing: one toast, not one per plot crossed. */
      refused: boolean;
    });

const DRAG_THRESHOLD_PX = 8;
const HARVEST_STAGGER_MS = 140;
const READY_POP_MS = 600;
const FLOAT_TEXT_MS = 1150;
const DIRT_MS = 600;
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
const artUrl = (file: string) => `${GARDEN_ART_DIR}/${file}`;

/**
 * The herb garden drawn in code: lawn, paths and benches behind one button per
 * plot, plants built from leaf and flower sprites, and a popover to sow or to
 * pull a plant. Seeds and harvests also work by dragging across plots.
 * `update` only redraws plots whose drawing changed, so the sway of the
 * others keeps going while the game re-renders.
 */
export class GardenScene {
  readonly root = el('div', {
    class: 'garden-scene',
    role: 'group',
    'aria-label': t.garden.scene.label,
    style: [
      `--tex-stone:url(${artUrl('stone.jpg')})`,
      `--tex-plank:url(${artUrl('plank.jpg')})`,
      `--tex-grass:url(${artUrl('grass.jpg')})`,
      `--tex-soil:url(${artUrl('soil.jpg')})`,
    ].join(';'),
  });
  private readonly scenery = el('div', { class: 'garden-scenery', 'aria-hidden': 'true' });
  private readonly entries = new Map<string, PlotEntry>();
  private sceneryLevel: number | null = null;
  private popover: Popover | null = null;
  private gesture: Gesture | null = null;
  /** The click that follows a pointer gesture was already handled by it. */
  private suppressClick = false;

  constructor(private readonly deps: GardenSceneDeps) {
    this.root.append(staticScenery(), this.scenery);
  }

  update(views: readonly PlotView[]): void {
    this.drawScenery(gardenLevel(this.deps.game.current));
    const inForce = new Set(views.map((view) => view.plot.id));
    [...this.entries]
      .filter(([plotId]) => !inForce.has(plotId))
      .forEach(([plotId, entry]) => {
        entry.button.remove();
        this.entries.delete(plotId);
      });
    views.forEach((view) => this.drawPlot(view));
    this.refreshPopover();
  }

  harvestAll(): void {
    const ready = [...this.entries.values()]
      .map((entry) => entry.view)
      .filter((view): view is ReadyView => view.kind === 'ready');
    if (ready.length === 0) return;
    this.closePopover();
    this.reap(ready, { type: 'garden_harvest' });
  }

  hasPopover(): boolean {
    return this.popover !== null;
  }

  closePopover(): void {
    const popover = this.popover;
    if (!popover) return;
    popover.node.remove();
    this.entries.get(popover.plotId)?.button.setAttribute('aria-expanded', 'false');
    this.popover = null;
  }

  // ---------- Scenery and plots ----------

  private drawScenery(level: number): void {
    if (level === this.sceneryLevel) return;
    this.sceneryLevel = level;
    const levels = this.deps.game.catalog.garden.levels.map((entry) => entry.plots);
    this.scenery.replaceChildren(...gardenScenery(levels, level).map(sceneryNode));
  }

  private drawPlot(view: PlotView): void {
    const entry = this.entries.get(view.plot.id) ?? this.createPlot(view.plot);
    const signature = plotSignature(view);
    const becameReady = entry.view.kind === 'growing' && view.kind === 'ready';
    entry.view = view;
    if (entry.signature === signature) return;
    entry.signature = signature;
    const { button: node } = entry;
    node.replaceChildren(plotBase(view), ...plotBadges(view));
    node.classList.toggle('is-ready', view.kind === 'ready');
    node.setAttribute('aria-label', plotAria(view));
    if (becameReady) flashClass(node, 'is-popping', READY_POP_MS);
  }

  private createPlot(plot: PlotDef): PlotEntry {
    const node = el('button', {
      class: `garden-plot garden-plot--${plot.type}`,
      type: 'button',
      style: boxStyle(plot),
      'data-plot-id': plot.id,
      'aria-expanded': 'false',
    });
    node.addEventListener('pointerdown', (event) => this.onPlotPointerDown(event, plot.id, node));
    node.addEventListener('click', () => this.onPlotClick(plot.id));
    this.root.insertBefore(node, this.popover?.node ?? null);
    const entry: PlotEntry = { button: node, view: { kind: 'empty', plot }, signature: '' };
    this.entries.set(plot.id, entry);
    return entry;
  }

  // ---------- Taps ----------

  private onPlotClick(plotId: string): void {
    if (this.suppressClick) return;
    const view = this.entries.get(plotId)?.view;
    if (!view) return;
    if (view.kind === 'ready') {
      this.reap([view], { type: 'garden_harvest', plotId });
      return;
    }
    if (this.popover?.plotId === plotId) this.closePopover();
    else this.openPopover(plotId);
  }

  private onSeedClick(seedId: string): void {
    if (this.suppressClick || !this.popover) return;
    if (this.plant(this.popover.plotId, seedId)) this.closePopover();
  }

  // ---------- Gestures: drag a seed to sow, drag the sickle to harvest ----------

  private onPlotPointerDown(event: PointerEvent, plotId: string, source: HTMLElement): void {
    if (!event.isPrimary || event.button !== 0) return;
    const view = this.entries.get(plotId)?.view;
    if (view?.kind !== 'ready') return;
    event.preventDefault();
    this.closePopover();
    this.suppressClick = true;
    this.reap([view], { type: 'garden_harvest', plotId });
    this.startGesture(event, source, { kind: 'harvest', ...gestureBase(event, sickleGhost()) });
  }

  private onSeedPointerDown(event: PointerEvent, seedId: string, source: HTMLElement): void {
    const origin = this.popover?.plotId;
    if (!event.isPrimary || event.button !== 0 || origin === undefined) return;
    event.preventDefault();
    this.suppressClick = true;
    const ghost = el('div', { class: 'garden-ghost' }, cropIcon(seedId));
    this.startGesture(event, source, {
      kind: 'plant',
      ...gestureBase(event, ghost),
      seedId,
      originPlotId: origin,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
      planted: 0,
      refused: false,
    });
  }

  private startGesture(event: PointerEvent, source: HTMLElement, gesture: Gesture): void {
    this.gesture = gesture;
    source.setPointerCapture(event.pointerId);
    const options = { signal: gesture.stop.signal };
    source.addEventListener('pointermove', (e) => this.onGestureMove(e), options);
    source.addEventListener('pointerup', () => this.endGesture(true), options);
    source.addEventListener('pointercancel', () => this.endGesture(false), options);
    source.addEventListener('lostpointercapture', () => this.endGesture(false), options);
    moveTo(gesture.ghost, event);
    this.overlay().append(gesture.ghost);
  }

  private onGestureMove(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    moveTo(gesture.ghost, event);
    const view = this.viewAt(event.clientX, event.clientY);
    if (gesture.kind === 'harvest') {
      if (view?.kind === 'ready')
        this.reap([view], { type: 'garden_harvest', plotId: view.plot.id });
      return;
    }
    const { start } = gesture;
    gesture.moved ||=
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG_THRESHOLD_PX;
    const target = view && this.accepts(view, gesture.seedId) ? view : undefined;
    this.markTarget(gesture.moved ? target?.plot.id : undefined);
    if (!gesture.moved || !target || gesture.refused) return;
    if (this.plant(target.plot.id, gesture.seedId)) gesture.planted += 1;
    else gesture.refused = true;
  }

  /** `released`: the pointer went up (a tap on a seed sows the open plot); otherwise the gesture was cancelled. */
  private endGesture(released: boolean): void {
    const gesture = this.gesture;
    if (!gesture) return;
    this.gesture = null;
    gesture.stop.abort();
    gesture.ghost.remove();
    this.markTarget(undefined);
    setTimeout(() => (this.suppressClick = false), 0);
    if (gesture.kind === 'plant' && released) this.finishSowing(gesture);
    this.refreshPopover();
  }

  private finishSowing(gesture: Extract<Gesture, { kind: 'plant' }>): void {
    const sowed = gesture.moved
      ? gesture.planted > 0
      : this.plant(gesture.originPlotId, gesture.seedId);
    if (sowed) this.closePopover();
  }

  private viewAt(x: number, y: number): PlotView | undefined {
    const hit = document.elementFromPoint(x, y)?.closest('.garden-plot');
    const plotId = hit instanceof HTMLElement ? hit.dataset.plotId : undefined;
    return plotId === undefined ? undefined : this.entries.get(plotId)?.view;
  }

  private accepts(view: PlotView, seedId: string): view is EmptyView {
    return (
      view.kind === 'empty' && findCrop(this.deps.game.current, seedId)?.plotType === view.plot.type
    );
  }

  private markTarget(plotId: string | undefined): void {
    this.entries.forEach((entry, id) => entry.button.classList.toggle('is-target', id === plotId));
  }

  /** Inside the modal dialog: anything appended to body would sit under its top layer. */
  private overlay(): HTMLElement {
    return this.root.closest('dialog') ?? document.body;
  }

  // ---------- Commands ----------

  /** Buys the seed when the camp holds none; a refusal is toasted by the store. */
  private plant(plotId: string, seedId: string): boolean {
    const { game, viewer } = this.deps;
    const plotType = this.entries.get(plotId)?.view.plot.type;
    if (!plotType) return false;
    const option = seedOptions(game.current, game.catalog, plotType, viewer()).find(
      (candidate) => candidate.crop.seedId === seedId,
    );
    if (!option) return false;
    const buy = option.action !== 'plant';
    if (game.dispatch({ type: 'garden_plant', plotId, seedId, buy }) !== null) return false;
    this.sprayDirt(plotId);
    return true;
  }

  private reap(views: readonly ReadyView[], command: GameCommand): void {
    if (this.deps.game.dispatch(command) !== null) return;
    views.forEach((view, i) => {
      this.deps.onHarvest(view);
      setTimeout(() => this.celebrate(view), i * HARVEST_STAGGER_MS);
    });
  }

  private clear(plotId: string): void {
    if (this.deps.game.dispatch({ type: 'garden_clear', plotId }) === null) this.closePopover();
  }

  // ---------- Popover ----------

  private openPopover(plotId: string): void {
    this.closePopover();
    this.popover = { plotId, node: el('div'), signature: '' };
    this.entries.get(plotId)?.button.setAttribute('aria-expanded', 'true');
    this.refreshPopover();
    this.popover?.node
      .querySelector<HTMLElement>('.garden-tray__seed:not(:disabled), .btn')
      ?.focus({ preventScroll: true });
  }

  /** Rebuilt only when what it shows changed, and never under a dragged seed. */
  private refreshPopover(): void {
    const popover = this.popover;
    if (!popover || this.gesture) return;
    const view = this.entries.get(popover.plotId)?.view;
    if (!view || view.kind === 'ready') {
      this.closePopover();
      return;
    }
    const options = view.kind === 'empty' ? this.seedOptionsFor(view.plot.type) : [];
    const signature = `${plotSignature(view)}|${JSON.stringify(
      options.map((o) => [o.crop.seedId, o.action, o.owned, o.priceBronze, o.shortBronze]),
    )}`;
    if (signature === popover.signature) return;
    const node = view.kind === 'empty' ? this.seedTray(view, options) : this.growingPanel(view);
    if (popover.node.isConnected) popover.node.replaceWith(node);
    else this.root.append(node);
    this.popover = { plotId: popover.plotId, node, signature };
    this.place(node, view.plot);
  }

  private place(node: HTMLElement, plot: Rect): void {
    const scene = { width: this.root.clientWidth, height: this.root.clientHeight };
    const size = { width: node.offsetWidth, height: node.offsetHeight };
    const { left, top } = popoverPosition(plot, scene, size);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }

  private seedOptionsFor(plotType: PlotType): SeedOption[] {
    const { game, viewer } = this.deps;
    return seedOptions(game.current, game.catalog, plotType, viewer());
  }

  private seedTray(view: EmptyView, options: readonly SeedOption[]): HTMLElement {
    const label = plotLabel(view.plot.id);
    const sameTypeEmpty = [...this.entries.values()].filter(
      (entry) => entry.view.kind === 'empty' && entry.view.plot.type === view.plot.type,
    ).length;
    const canSow = options.some((option) => isSowable(option));
    return popoverShell(
      t.garden.scene.plantIn(label),
      () => this.closePopover(),
      el('h3', { class: 'garden-pop__title' }, label),
      el(
        'p',
        {},
        view.plot.type === 'estufa' ? t.garden.scene.chooseTraySeed : t.garden.scene.chooseSeed,
      ),
      options.length === 0
        ? el('p', { class: 'panel__hint' }, t.garden.noSeeds)
        : el(
            'div',
            { class: 'garden-tray', role: 'group', 'aria-label': t.garden.chooseSeed },
            ...options.map((option) => this.seedButton(option)),
          ),
      canSow &&
        sameTypeEmpty > 1 &&
        el('p', { class: 'garden-pop__hint' }, t.garden.scene.dragHint),
    );
  }

  private seedButton(option: SeedOption): HTMLElement {
    const { seedId } = option.crop;
    const node = el(
      'button',
      {
        class: 'garden-tray__seed',
        type: 'button',
        disabled: !isSowable(option),
        title: this.seedTitle(option),
      },
      cropIcon(seedId),
      el('span', { class: 'garden-tray__name' }, option.seedName),
      el('small', { class: 'garden-tray__tag' }, ...this.seedTag(option)),
    );
    node.addEventListener('pointerdown', (event) => this.onSeedPointerDown(event, seedId, node));
    node.addEventListener('click', () => this.onSeedClick(seedId));
    return node;
  }

  private seedTag(option: SeedOption): (Node | string)[] {
    if (option.owned >= 1 || option.action === 'plant') return [t.garden.scene.owned(option.owned)];
    if (option.action === 'rare_locked') return [t.garden.scene.rare];
    return this.coins(option.priceBronze ?? 0);
  }

  private seedTitle(option: SeedOption): string {
    const titles = t.garden.scene.seedTitle;
    switch (option.action) {
      case 'plant':
        return titles.plant(option.seedName);
      case 'buy':
        return titles.buy(option.seedName, this.priceText(option.priceBronze ?? 0));
      case 'camp_short':
        return titles.camp_short(option.seedName, this.priceText(option.shortBronze ?? 0));
      case 'rare_locked':
        return t.garden.scene.rareTitle(option.seedName);
    }
  }

  /** One icon and count per coin, biggest first: "🪙1 🪙2". */
  private coins(bronze: number): (Node | string)[] {
    const { catalog } = this.deps.game;
    const bag = fromBronze(bronze, catalog.currencies);
    return catalog.currencies
      .filter((currency) => (bag[currency.id] ?? 0) > 0)
      .flatMap((currency) => {
        const src = resolveImage(catalog, currency.icon);
        const count = String(bag[currency.id] ?? 0);
        return src
          ? [el('img', { src, alt: currency.name }), count]
          : [`${count} ${currency.name}`];
      });
  }

  private priceText(bronze: number): string {
    const { catalog } = this.deps.game;
    return formatPrice(catalog, fromBronze(bronze, catalog.currencies));
  }

  private growingPanel(view: GrowingView): HTMLElement {
    const label = plotLabel(view.plot.id);
    const actions = el('div', { class: 'row garden-pop__actions' });
    const pullButton = (): HTMLElement =>
      el('button', { class: 'btn btn--danger', type: 'button', onclick: ask }, t.garden.clear);
    const ask = () =>
      actions.replaceChildren(
        el('span', { class: 'garden-pop__ask' }, t.garden.scene.clearAsk),
        el(
          'button',
          { class: 'btn btn--danger', type: 'button', onclick: () => this.clear(view.plot.id) },
          t.garden.clear,
        ),
        button(t.garden.scene.cancel, () => actions.replaceChildren(pullButton())),
      );
    actions.append(pullButton());
    const title = view.crop.rare
      ? `${view.harvestName} · ${t.garden.scene.rare}`
      : view.harvestName;
    return popoverShell(
      t.garden.scene.plantedIn(view.harvestName, label),
      () => this.closePopover(),
      el('h3', { class: 'garden-pop__title' }, title),
      el('p', {}, `${label} · ${t.garden.scene.readyIn(view.daysLeft, view.crop.yield)}`),
      progressBar(view.progress),
      actions,
    );
  }

  // ---------- Effects ----------

  private celebrate(view: ReadyView): void {
    const text = t.garden.scene.harvested(view.crop.yield, view.harvestName);
    this.floatText(view.plot, text);
    if (!reducedMotion()) this.flyIcons(view);
  }

  private floatText(plot: Rect, text: string): void {
    const node = el(
      'span',
      {
        class: 'garden-fx-text',
        style: `left:${percent(plot.x + plot.w / 2)};top:${percent(plot.y + plot.h / 2 - 0.08)}`,
      },
      text,
    );
    this.root.append(node);
    setTimeout(() => node.remove(), FLOAT_TEXT_MS);
  }

  private sprayDirt(plotId: string): void {
    const plot = this.entries.get(plotId)?.view.plot;
    if (!plot || reducedMotion()) return;
    const center = `left:${percent(plot.x + plot.w / 2)};top:${percent(plot.y + plot.h / 2)}`;
    const specks = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const dx = Math.cos(angle) * 26;
      const dy = Math.sin(angle) * 18 - 6;
      return el('span', { class: 'garden-fx-dirt', style: `${center};--dx:${dx}px;--dy:${dy}px` });
    });
    this.root.append(...specks);
    setTimeout(() => specks.forEach((speck) => speck.remove()), DIRT_MS);
  }

  private flyIcons(view: ReadyView): void {
    const from = this.entries.get(view.plot.id)?.button;
    const to = this.deps.harvestTarget(view.crop.harvestId);
    if (!from || !to) return;
    const [x0, y0] = centerOf(from);
    const [x1, y1] = centerOf(to);
    [0, 1, 2].forEach((i) => {
      const icon = cropIcon(view.crop.seedId, 'garden-fx-fly');
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
        if (i === 2) this.bump(view.crop.harvestId);
      };
    });
  }

  /** Looked up again: the strip may have been redrawn while the icons flew. */
  private bump(harvestId: string): void {
    const target = this.deps.harvestTarget(harvestId);
    if (target) flashClass(target, 'is-bumping', 400);
  }
}

// ---------- Plot drawing ----------

function sceneryNode(piece: SceneryPiece): HTMLElement {
  if (piece.kind === 'bench') {
    return el('div', {
      class: `garden-bench garden-bench--${piece.style}`,
      style: boxStyle(piece.box),
    });
  }
  return el(
    'div',
    { class: 'garden-locked', style: boxStyle(piece.box) },
    t.garden.scene.locked[piece.area](piece.level),
  );
}

/** Paths and tree shade, the same at every level. */
function staticScenery(): HTMLElement {
  const piece = (className: string, box: Rect) =>
    el('div', { class: className, style: boxStyle(box) });
  return el(
    'div',
    { class: 'garden-scenery', 'aria-hidden': 'true' },
    el('div', { class: 'garden-lawn' }),
    piece('garden-path', { x: 0.472, y: 0.22, w: 0.056, h: 0.72 }),
    piece('garden-path', { x: 0.05, y: 0.455, w: 0.9, h: 0.064 }),
    piece('garden-shade', { x: -0.04, y: -0.06, w: 0.22, h: 0.3 }),
    piece('garden-shade', { x: 0.88, y: -0.04, w: 0.16, h: 0.26 }),
  );
}

const soil = () => el('span', { class: 'garden-soil' });
const pot = (x: number) => el('span', { class: 'garden-pot', style: `left:${x}%` }, soil());

const PLOT_GROUND: Record<PlotType, () => HTMLElement[]> = {
  canteiro: () => [soil()],
  muda: () => [pot(50)],
  estufa: () => plantSpots('estufa').map((spot) => pot(spot.x)),
  arcana: () => [el('span', { class: 'garden-basin' }, soil())],
  lago: () => [el('span', { class: 'garden-water' })],
};

function plotBase(view: PlotView): HTMLElement {
  const stage = plantStage(view);
  const plants =
    stage && view.kind !== 'empty'
      ? el(
          'span',
          { class: 'garden-plants', style: `--hue:${cropLook(view.crop.seedId).hue}deg` },
          ...plantTufts(view.plot.type, stage, cropLook(view.crop.seedId)).map(tuftNode),
        )
      : null;
  return el('span', { class: 'garden-plot__base' }, ...PLOT_GROUND[view.plot.type](), plants);
}

function tuftNode(tuft: Tuft, i: number): HTMLElement {
  const { spot } = tuft;
  const at = `left:${spot.x}%;top:${spot.y}%`;
  if (tuft.kind === 'mound') {
    return el('span', { class: 'garden-mound', style: `${at};width:${spot.size * 0.4}%` });
  }
  return el('img', {
    class: `garden-tuft garden-tuft--${tuft.tone}`,
    src: artUrl(`${tuft.sprite}.png`),
    alt: '',
    draggable: 'false',
    style: [
      at,
      `width:${spot.size}%`,
      `--rot:${tuft.rotation}deg`,
      `--d:${tuft.delay}s`,
      `--s:${tuft.scale}`,
      `--i:${i}`,
    ].join(';'),
  });
}

function plotBadges(view: PlotView): HTMLElement[] {
  switch (view.kind) {
    case 'empty':
      return [];
    case 'growing':
      return [
        el(
          'span',
          { class: 'garden-status' },
          el(
            'span',
            { class: 'garden-status__bar' },
            el('i', { style: `width:${view.progress * 100}%` }),
          ),
          t.garden.scene.daysShort(view.daysLeft),
        ),
      ];
    case 'ready':
      return [
        el('span', { class: 'garden-bubble' }, cropIcon(view.crop.seedId)),
        ...SPARKS.map(([x, y], i) =>
          el('span', {
            class: 'garden-spark',
            style: `left:${x}%;top:${y}%;animation-delay:${i * 0.45}s`,
          }),
        ),
      ];
  }
}

function plotAria(view: PlotView): string {
  const label = plotLabel(view.plot.id);
  const aria = t.garden.scene.plotAria;
  switch (view.kind) {
    case 'empty':
      return aria.empty(label);
    case 'growing':
      return aria.growing(label, view.harvestName, view.daysLeft);
    case 'ready':
      return aria.ready(label, view.harvestName, view.crop.yield);
  }
}

/** A crop's face in the tray, the bubble and the strip: its flower, or a leaf for foliage. */
export function cropIcon(seedId: string, className = ''): HTMLImageElement {
  const look = cropLook(seedId);
  const sprite = look.kind === 'flower' ? 'flower3' : 'leaf0';
  return el('img', {
    class: `garden-icon garden-icon--${look.kind} ${className}`.trim(),
    src: artUrl(`${sprite}.png`),
    alt: '',
    draggable: 'false',
    style: `--hue:${look.hue}deg`,
  });
}

function isSowable(option: SeedOption): boolean {
  return option.action === 'plant' || option.action === 'buy';
}

function popoverShell(
  label: string,
  onClose: () => void,
  ...children: (HTMLElement | false)[]
): HTMLElement {
  return el(
    'div',
    { class: 'garden-pop', role: 'dialog', 'aria-label': label },
    closeButton(t.garden.closePopover, onClose),
    ...children,
  );
}

function progressBar(progress: number): HTMLElement {
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

const SICKLE_PATHS: readonly Record<string, string>[] = [
  {
    d: 'M14 50 C10 26 26 8 50 10 C34 14 24 28 28 46 Z',
    fill: '#cfd6dc',
    stroke: '#5b646b',
    'stroke-width': '2',
  },
  { d: 'M14 50 L6 60', stroke: '#8a5a2b', 'stroke-width': '7', 'stroke-linecap': 'round' },
  { d: 'M14 50 L6 60', stroke: '#c08a52', 'stroke-width': '3', 'stroke-linecap': 'round' },
];

function sickleGhost(): HTMLElement {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  SICKLE_PATHS.forEach((attrs) => {
    const path = document.createElementNS(svgNs, 'path');
    Object.entries(attrs).forEach(([name, value]) => path.setAttribute(name, value));
    svg.append(path);
  });
  return el('div', { class: 'garden-ghost garden-ghost--sickle' }, svg);
}

function gestureBase(event: PointerEvent, ghost: HTMLElement): GestureBase {
  return { pointerId: event.pointerId, ghost, stop: new AbortController() };
}

function moveTo(ghost: HTMLElement, event: PointerEvent): void {
  ghost.style.left = `${event.clientX}px`;
  ghost.style.top = `${event.clientY}px`;
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
