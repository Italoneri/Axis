import type { Meal, MenuItem, TavernMenu } from '../model/schema';

/** assets.json keys of the menu photos (`menu.<id>`). */
export const MENU_IMAGE_PREFIX = 'menu.';

/** The dishes of one meal, in the order tavern_menu.json lists them. */
export function menuFor(menu: TavernMenu, meal: Meal): MenuItem[] {
  return menu.items.filter((item) => item.meal === meal);
}

/** The level the tavern needs before serving the dish. */
export function dishLevel(item: MenuItem): number {
  return item.minLevel ?? 1;
}

/** A tavern serves the dishes of its level in effect and below. */
export function isDishAvailable(item: MenuItem, tavernLevel: number): boolean {
  return tavernLevel >= dishLevel(item);
}
