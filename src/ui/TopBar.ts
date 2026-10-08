import { t } from '../i18n/pt-BR';
import type { GameState } from '../model/schema';
import type { GameStore } from '../store';
import { el } from './dom';
import type { MasterSession } from './MasterSession';
import { ResourceMenu } from './ResourceMenu';
import { GoldPanel } from './resources/GoldPanel';
import { InfluencePanel } from './resources/InfluencePanel';
import { MaterialsPanel } from './resources/MaterialsPanel';
import { ResearchPanel } from './resources/ResearchPanel';
import { createSaveControls } from './SaveControls';
import type { Act } from './widgets';

export interface TopBarActions {
  notify: (msg: string, tone?: 'error') => void;
  toggleDrawer: () => void;
  openMaster: () => void;
}

export function mountTopBar(
  root: HTMLElement,
  popover: HTMLElement,
  { store, session, act }: { store: GameStore; session: MasterSession; act: Act },
  actions: TopBarActions,
): void {
  const menu = new ResourceMenu(popover, store, [
    new GoldPanel(store, session, act).menuItem,
    new MaterialsPanel(store, session, act).menuItem,
    new ResearchPanel(store, session, act).menuItem,
    new InfluencePanel(store, session, act).menuItem,
  ]);
  const day = el('span', { class: 'topbar__day' });

  root.append(
    el('span', { class: 'topbar__brand' }, 'AXIS'),
    menu.mount(store.catalog, session),
    day,
    el(
      'div',
      { class: 'topbar__actions' },
      el('button', { class: 'btn', type: 'button', onclick: actions.toggleDrawer }, t.drawer.open),
      el('button', { class: 'btn', type: 'button', onclick: actions.openMaster }, t.master.enter),
    ),
    createSaveControls(store, actions.notify),
  );

  const render = (state: GameState) => (day.textContent = t.day(state.day));
  render(store.current);
  store.subscribe(render);
}
