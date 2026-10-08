import { t } from '../i18n/pt-BR';
import type { GameState } from '../model/schema';
import type { GameStore } from '../store';
import { el } from './dom';
import { createSaveControls } from './SaveControls';

export interface TopBarActions {
  notify: (msg: string, tone?: 'error') => void;
  toggleDrawer: () => void;
  openMaster: () => void;
}

export function mountTopBar(root: HTMLElement, store: GameStore, actions: TopBarActions): void {
  const { catalog } = store;
  const amounts = new Map<string, HTMLElement>();

  const resourceItems = catalog.resources.map((resource) => {
    const amount = el('span', { class: 'resource__amount' });
    amounts.set(resource.id, amount);
    return el(
      'li',
      { class: 'resource', title: resource.name },
      el('img', { src: catalog.assets.images[resource.icon] ?? '', alt: '' }),
      el('span', { class: 'resource__name' }, `${resource.name}:`),
      amount,
    );
  });
  const day = el('span', { class: 'topbar__day' });

  root.append(
    el('span', { class: 'topbar__brand' }, 'AXIS'),
    el('ul', { class: 'topbar__resources' }, ...resourceItems),
    day,
    el(
      'div',
      { class: 'topbar__actions' },
      el('button', { class: 'btn', type: 'button', onclick: actions.toggleDrawer }, t.drawer.open),
      el('button', { class: 'btn', type: 'button', onclick: actions.openMaster }, t.master.enter),
    ),
    createSaveControls(store, actions.notify),
  );

  const render = (state: GameState) => {
    amounts.forEach((node, id) => (node.textContent = String(state.resources[id] ?? 0)));
    day.textContent = t.day(state.day);
  };
  render(store.current);
  store.subscribe(render);
}
