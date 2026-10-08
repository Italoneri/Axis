import { t } from '../i18n/pt-BR';
import type { GameState } from '../model/schema';
import { el } from './dom';
import { ResourceMenu } from './ResourceMenu';
import { GoldPanel } from './resources/GoldPanel';
import { InfluencePanel } from './resources/InfluencePanel';
import { MaterialsPanel } from './resources/MaterialsPanel';
import { ResearchPanel } from './resources/ResearchPanel';
import { createSaveControls } from './SaveControls';
import type { PanelDeps } from './widgets';

export interface TopBarActions {
  notify: (msg: string, tone?: 'error') => void;
  toggleDrawer: () => void;
  openMaster: () => void;
}

export function mountTopBar(
  root: HTMLElement,
  popover: HTMLElement,
  deps: PanelDeps,
  actions: TopBarActions,
): void {
  const { store, session } = deps;
  const menu = new ResourceMenu(popover, store, [
    new GoldPanel(deps).menuItem,
    new MaterialsPanel(deps).menuItem,
    new ResearchPanel(deps).menuItem,
    new InfluencePanel(deps).menuItem,
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
