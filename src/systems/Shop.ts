import type { Catalog } from '../model/catalog';
import type { GameState, ShopItem } from '../model/schema';
import type { Actor } from '../commands/schema';
import { builtLevel } from './BuildSystem';
import { toBronze } from './Coins';

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
