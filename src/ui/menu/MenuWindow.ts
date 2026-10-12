import { t } from '../../i18n/pt-BR';
import { resolveImage, TAVERN_BUILDING_ID, type Catalog } from '../../model/catalog';
import { MEALS, type Meal, type MenuItem } from '../../model/schema';
import type { GameStore } from '../../store';
import { builtLevel } from '../../systems/BuildSystem';
import { dishLevel, isDishAvailable, menuFor } from '../../systems/TavernMenu';
import { el } from '../dom';
import { formatPrice } from '../format';
import type { UiMemory } from '../uiMemory';

const MEAL_MEMORY_KEY = 'menu.meal';

export interface MenuWindowDeps {
  game: GameStore;
  memory: UiMemory;
}

/**
 * "Cardápio da Taverna": a large <dialog> with one tab per meal and the dishes
 * in a grid. Dishes above the tavern's level show faded, so the menu grows
 * with the building.
 */
export class MenuWindow {
  private dialog: HTMLDialogElement | null = null;
  private meal: Meal = 'breakfast';
  private stopWatching: (() => void) | null = null;
  private readonly tabs = el('nav', { class: 'tabs', role: 'tablist' });
  private readonly body = el('div', { class: 'menu__body' });

  constructor(private readonly deps: MenuWindowDeps) {}

  open(): void {
    if (this.dialog) return;
    this.meal = parseMeal(this.deps.memory.pick(MEAL_MEMORY_KEY, MEALS, 'breakfast'));
    const dialog = this.buildDialog();
    this.dialog = dialog;
    // A tavern finishing an upgrade while the menu is open unlocks dishes.
    this.stopWatching = this.deps.game.subscribe(() => this.render());
    document.body.append(dialog);
    this.render();
    dialog.showModal();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--menu', 'aria-label': t.menu.title },
      el(
        'header',
        { class: 'menu__header' },
        el('h2', { class: 'panel__title' }, t.menu.title),
        closeButton(t.menu.close, () => dialog.close()),
      ),
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
    if (!this.dialog) return;
    const { catalog, current } = this.deps.game;
    const level = builtLevel(current, TAVERN_BUILDING_ID);
    const dishes = menuFor(catalog.tavernMenu, this.meal);
    this.tabs.replaceChildren(...MEALS.map((meal) => this.tab(meal)));
    this.body.replaceChildren(
      ...(level < 1 ? [el('p', { class: 'notice' }, t.menu.notBuilt)] : []),
      dishes.length === 0
        ? el('p', { class: 'panel__hint' }, t.menu.empty)
        : el(
            'ul',
            { class: 'menu__grid', role: 'tabpanel' },
            ...dishes.map((item) => dishCard(catalog, item, level)),
          ),
    );
  }

  private tab(meal: Meal): HTMLElement {
    const isActive = meal === this.meal;
    return el(
      'button',
      {
        class: isActive ? 'tab tab--active' : 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(isActive),
        onclick: () => {
          this.meal = meal;
          this.deps.memory.set(MEAL_MEMORY_KEY, meal);
          this.render();
        },
      },
      t.menu.meals[meal],
    );
  }
}

function dishCard(catalog: Catalog, item: MenuItem, tavernLevel: number): HTMLElement {
  const isAvailable = isDishAvailable(item, tavernLevel);
  return el(
    'li',
    { class: isAvailable ? 'menu-dish' : 'menu-dish menu-dish--locked' },
    dishPhoto(resolveImage(catalog, item.image), item.name),
    el(
      'div',
      { class: 'menu-dish__text' },
      el('h3', { class: 'menu-dish__name' }, item.name),
      el('p', { class: 'menu-dish__description' }, item.description),
      item.effect && el('p', { class: 'menu-dish__effect' }, item.effect),
      item.price && el('p', { class: 'menu-dish__price' }, formatPrice(catalog, item.price)),
      !isAvailable && el('p', { class: 'menu-dish__lock' }, t.menu.lockedAt(dishLevel(item))),
    ),
  );
}

/** The photo opens enlarged; a missing file turns into the same placeholder as no photo. */
function dishPhoto(src: string | undefined, name: string): HTMLElement {
  const placeholder = () =>
    el('div', { class: 'menu-dish__photo menu-dish__photo--placeholder', 'aria-hidden': 'true' });
  if (!src) return placeholder();
  const img = el('img', { class: 'menu-dish__img', src, alt: '', loading: 'lazy' });
  const photo = el(
    'button',
    {
      class: 'menu-dish__photo',
      type: 'button',
      'aria-label': t.menu.enlarge(name),
      onclick: () => showPhoto(src, name),
    },
    img,
  );
  img.addEventListener('error', () => photo.replaceWith(placeholder()), { once: true });
  return photo;
}

function showPhoto(src: string, name: string): void {
  const dialog = el(
    'dialog',
    { class: 'dialog dialog--photo', 'aria-label': name },
    closeButton(t.menu.closePhoto, () => dialog.close()),
    el('img', { class: 'menu-photo__img', src, alt: name }),
    el('p', { class: 'menu-photo__caption' }, name),
  );
  keepEscapeInside(dialog);
  // A click on the photo or the backdrop closes it too.
  dialog.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function closeButton(label: string, onClose: () => void): HTMLElement {
  return el(
    'button',
    { class: 'btn btn--icon', type: 'button', 'aria-label': label, onclick: onClose },
    '×',
  );
}

/** Esc closes the dialog; the slot panel behind it should stay open. */
function keepEscapeInside(dialog: HTMLDialogElement): void {
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });
}

function parseMeal(value: string): Meal {
  return MEALS.find((meal) => meal === value) ?? 'breakfast';
}
