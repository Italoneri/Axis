import { t } from '../i18n/pt-BR';
import type { GameState } from '../model/schema';
import { el } from './dom';
import { ResourceMenu } from './ResourceMenu';
import { GoldPanel } from './resources/GoldPanel';
import { InfluencePanel } from './resources/InfluencePanel';
import { MaterialsPanel } from './resources/MaterialsPanel';
import { NpcPanel } from './resources/NpcPanel';
import { ResearchPanel } from './resources/ResearchPanel';
import { createSaveControls } from './SaveControls';
import type { ArchiveStore } from '../archiveStore';
import type { PanelDeps } from './widgets';
import type { SpriteOverrides } from '../map/npcSprites';

export interface TopBarActions {
  notify: (msg: string, tone?: 'error') => void;
  toggleDrawer: () => void;
  openMaster: () => void;
  showCredits: () => void;
}

/**
 * Space-saving steps, applied in order until the bar fits its width:
 * shorten the resources to icon and number, fold the action buttons into "☰",
 * hide the brand, and finally let the resources scroll sideways.
 */
const FIT_STEPS = ['is-compact', 'is-collapsed', 'is-tight', 'is-scrolling'] as const;

export function mountTopBar(
  root: HTMLElement,
  popover: HTMLElement,
  deps: PanelDeps & { archive: ArchiveStore; spriteOverrides: SpriteOverrides },
  actions: TopBarActions,
): void {
  const { store, session } = deps;
  const menu = new ResourceMenu(popover, store, [
    new GoldPanel(deps).menuItem,
    new MaterialsPanel(deps).menuItem,
    new ResearchPanel(deps).menuItem,
    new InfluencePanel(deps).menuItem,
    new NpcPanel(deps).menuItem,
  ]);
  const day = el('span', { class: 'topbar__day' });
  const overflow = createOverflowMenu(
    el(
      'div',
      { class: 'topbar__actions' },
      el('button', { class: 'btn', type: 'button', onclick: actions.toggleDrawer }, t.drawer.open),
      el('button', { class: 'btn', type: 'button', onclick: actions.openMaster }, t.master.enter),
      el('button', { class: 'btn', type: 'button', onclick: actions.showCredits }, t.credits.open),
    ),
    createSaveControls(store, deps.archive, actions.notify),
  );

  root.append(
    el('span', { class: 'topbar__brand' }, 'AXIS'),
    menu.mount(store.catalog, session),
    day,
    ...overflow,
  );

  const fit = () => fitToWidth(root);
  const render = (state: GameState) => {
    day.textContent = t.day(state.day);
    fit();
  };
  render(store.current);
  store.subscribe(render);
  new ResizeObserver(fit).observe(root);
  void document.fonts.ready.then(fit);
}

function fitToWidth(root: HTMLElement): void {
  root.classList.remove(...FIT_STEPS);
  const overflows = () => root.scrollWidth > root.clientWidth;
  for (const step of FIT_STEPS) {
    if (!overflows()) return;
    root.classList.add(step);
  }
}

/**
 * The action buttons sit inline while they fit; once the bar is collapsed they
 * move into a dropdown opened by "☰". Same nodes either way, so no handler is duplicated.
 */
function createOverflowMenu(...groups: HTMLElement[]): HTMLElement[] {
  const list = el('div', { class: 'topbar__menu', id: 'topbar-menu' }, ...groups);
  const toggle = el(
    'button',
    {
      class: 'btn topbar__more',
      type: 'button',
      title: t.topbar.more,
      'aria-label': t.topbar.more,
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': list.id,
    },
    '☰',
  );
  const setOpen = (open: boolean) => {
    list.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const isOpen = () => list.classList.contains('is-open');

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  list.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) setOpen(false);
  });
  // Capture phase: the Phaser canvas stops pointer events from bubbling.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const target = event.target;
      if (!isOpen() || !(target instanceof Node)) return;
      if (!list.contains(target) && !toggle.contains(target)) setOpen(false);
    },
    { capture: true },
  );
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    setOpen(false);
    toggle.focus();
  });
  return [toggle, list];
}
