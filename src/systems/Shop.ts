import type { Catalog } from '../model/catalog';
import type { GameState, ShopItem } from '../model/schema';
import type { Actor } from '../commands/schema';
import { builtLevel } from './BuildSystem';
import { toBronze } from './Coins';
import { idError } from './Categories';
import { fail, ok, type ActionError, type Outcome } from './outcome';

export const TRADING_POST_BUILDING_ID = 'trading_post';
export const SELL_BACK_LEVEL = 3;

export interface ShopEntry {
  item: ShopItem;
  name: string;
  image: string | undefined;
  unitBronze: number;
  /** Infinite stock: the staple goods every Entreposto carries. */
  isBasic: boolean;
  /** Only the master sees items above the Entreposto level. */
  isLocked: boolean;
}

export function tradingPostLevel(state: GameState): number {
  return builtLevel(state, TRADING_POST_BUILDING_ID);
}

export function baseUnitBronze(item: ShopItem, catalog: Catalog): number {
  return toBronze(item.price, catalog.currencies);
}

export function unitPriceBronze(item: ShopItem, catalog: Catalog): number {
  const base = baseUnitBronze(item, catalog);
  if (item.discountPercent === undefined) return base;
  return Math.max(1, Math.floor((base * (100 - item.discountPercent)) / 100));
}

/** Half the base price of the whole lot; promotions never lower it. */
export function sellBackBronze(item: ShopItem, quantity: number, catalog: Catalog): number {
  return Math.floor((baseUnitBronze(item, catalog) * quantity) / 2);
}

function shopName(state: GameState, item: ShopItem): string | undefined {
  if (item.kind === 'equipment') return item.name;
  return state.materials.items.find((m) => m.id === item.materialId)?.name;
}

function shopImage(state: GameState, item: ShopItem): string | undefined {
  if (item.image) return item.image;
  if (item.kind === 'equipment') return undefined;
  return state.materials.items.find((m) => m.id === item.materialId)?.icon;
}

export function isOnSale(state: GameState, item: ShopItem, viewer: Actor): boolean {
  if (shopName(state, item) === undefined) return false;
  if (viewer.role === 'master') return true;
  const level = tradingPostLevel(state);
  return !item.hidden && level >= 1 && level >= item.minLevel;
}

/** Players see what is on sale; the master sees everything, locked and hidden included. */
export function shopEntries(state: GameState, catalog: Catalog, viewer: Actor): ShopEntry[] {
  const level = tradingPostLevel(state);
  return state.shop.items.flatMap((item) => {
    const name = shopName(state, item);
    if (name === undefined || !isOnSale(state, item, viewer)) return [];
    return [
      {
        item,
        name,
        image: shopImage(state, item),
        unitBronze: unitPriceBronze(item, catalog),
        isBasic: item.stock === null,
        isLocked: item.minLevel > level,
      },
    ];
  });
}

/** What the master edits of an item; the id, the promotion and the photo have their own commands. */
type EditableFields<T> = T extends unknown ? Omit<T, 'id' | 'discountPercent' | 'image'> : never;
export type ShopItemFields = EditableFields<ShopItem>;

export function addShopItem(state: GameState, item: { id: string } & ShopItemFields): Outcome {
  const error = idError(item.id, state.shop.items) ?? fieldsError(state, item);
  if (error) return fail(error);
  return ok(setItems(state, [...state.shop.items, { ...cleanFields(item), id: item.id }]));
}

/** Keeps the promotion and the photo: only the fields the master form shows change. */
export function updateShopItem(state: GameState, id: string, fields: ShopItemFields): Outcome {
  const current = findShopItem(state, id);
  if (!current) return fail('not_found');
  const error = fieldsError(state, fields, id);
  if (error) return fail(error);
  const { discountPercent, image } = current;
  const next: ShopItem = {
    ...cleanFields(fields),
    id,
    ...(discountPercent === undefined ? {} : { discountPercent }),
    ...(image === undefined ? {} : { image }),
  };
  return ok(setItems(state, state.shop.items.map((item) => (item.id === id ? next : item))));
}

export function removeShopItem(state: GameState, id: string): Outcome {
  if (!findShopItem(state, id)) return fail('not_found');
  return ok(setItems(state, state.shop.items.filter((item) => item.id !== id)));
}

/** `null` ends the promotion. */
export function setShopPromotion(
  state: GameState,
  id: string,
  discountPercent: number | null,
): Outcome {
  const current = findShopItem(state, id);
  if (!current) return fail('not_found');
  const { discountPercent: previous, ...undiscounted } = current;
  if ((discountPercent ?? undefined) === previous) return ok(state);
  const next: ShopItem =
    discountPercent === null ? undiscounted : { ...undiscounted, discountPercent };
  return ok(setItems(state, state.shop.items.map((item) => (item.id === id ? next : item))));
}

function findShopItem(state: GameState, id: string): ShopItem | undefined {
  return state.shop.items.find((item) => item.id === id);
}

function setItems(state: GameState, items: ShopItem[]): GameState {
  return { ...state, shop: { ...state.shop, items } };
}

function fieldsError(state: GameState, fields: ShopItemFields, ownId?: string): ActionError | null {
  if (fields.kind === 'equipment') return fields.name.trim() ? null : 'empty_name';
  if (!state.materials.items.some((m) => m.id === fields.materialId)) return 'not_found';
  const isListed = state.shop.items.some(
    (item) => item.id !== ownId && item.kind === 'material' && item.materialId === fields.materialId,
  );
  return isListed ? 'material_already_listed' : null;
}

function cleanFields(fields: ShopItemFields): ShopItemFields {
  return fields.kind === 'equipment' ? { ...fields, name: fields.name.trim() } : fields;
}
