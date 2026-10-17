import type { Catalog } from '../model/catalog';
import type { Cost, GameState, ShopItem } from '../model/schema';
import type { Actor } from '../commands/schema';
import { builtLevel } from './BuildSystem';
import { addCoins, fromBronze, pay, toBronze } from './Coins';
import { idError } from './Categories';
import { depotAuthorOf, QUANTITY_LIMIT, type DepotDelivery } from './Depot';
import { materialNeeds, setMaterials } from './Materials';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';
import { CAMP, setWallet, walletLabel, walletOf, type WalletRef } from './Wallets';

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

export interface PurchaseOrder {
  itemId: string;
  quantity: number;
  payer: WalletRef;
  /** Id of the depot item an equipment purchase creates. */
  deliveryId: string;
}

export type PurchaseOutcome =
  /** `delivery` is set when the purchase must be filed in the depot (equipment). */
  | { ok: true; state: GameState; delivery: DepotDelivery | null }
  | { ok: false; error: ActionError };

/** The master buys for free; a player pays `payer` the promotional price of the whole lot. */
export function buyFromShop(
  state: GameState,
  catalog: Catalog,
  order: PurchaseOrder,
  actor: Actor,
): PurchaseOutcome {
  const { quantity } = order;
  const item = findShopItem(state, order.itemId);
  if (!item) return refuse('not_found');
  if (!isOnSale(state, item, actor)) return refuse('not_for_sale');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > QUANTITY_LIMIT) {
    return refuse('invalid_quantity');
  }
  if (item.stock !== null && quantity > item.stock) return refuse('out_of_stock');

  const delivery = item.kind === 'equipment' ? equipmentDelivery(item, order, actor) : null;
  // Equipment needs an owner for its private area; an unidentified player has none.
  if (item.kind === 'equipment' && !delivery) return refuse('not_found');

  const isMaster = actor.role === 'master';
  const cost = isMaster ? 0 : unitPriceBronze(item, catalog) * quantity;
  const paid = isMaster ? ok(state) : charge(state, catalog, order.payer, cost);
  if (!paid.ok) return refuse(paid.error);

  const stocked = withStock(paid.state, item, item.stock === null ? null : item.stock - quantity);
  const delivered =
    item.kind === 'material' ? addStock(stocked, item.materialId, quantity) : stocked;
  const walletName = isMaster ? undefined : walletLabel(state, order.payer);
  const itemName = delivery?.ownerId ? undefined : shopName(state, item);
  const logged = withLog(delivered, {
    day: state.day,
    kind: 'shop_purchased',
    quantity,
    bronze: cost,
    ...(walletName === undefined ? {} : { wallet: walletName }),
    ...(itemName === undefined ? {} : { item: itemName }),
  });
  return { ok: true, state: logged, delivery };
}

export interface PurchaseLine {
  itemId: string;
  materialId: string;
  quantity: number;
  bronze: number;
}

export interface MissingPurchase {
  lines: PurchaseLine[];
  totalBronze: number;
  /** Material ids not buyable: no shop item, not on sale, or too little stock left. */
  unavailable: string[];
}

/** What it takes to buy the materials `cost` lacks, priced as the viewer sees the shop. */
export function missingPurchase(
  state: GameState,
  catalog: Catalog,
  cost: Cost,
  viewer: Actor,
): MissingPurchase {
  const { missing, unknown } = materialNeeds(state.materials, cost.materials ?? {});
  const wanted = Object.entries(missing).map(([materialId, quantity]) => ({
    materialId,
    quantity,
    item: materialItem(state, materialId),
  }));
  const lines = wanted.flatMap(({ materialId, quantity, item }) =>
    item && isBuyable(state, item, quantity, viewer)
      ? [
          {
            itemId: item.id,
            materialId,
            quantity,
            bronze: viewer.role === 'master' ? 0 : unitPriceBronze(item, catalog) * quantity,
          },
        ]
      : [],
  );
  const bought = new Set(lines.map((line) => line.materialId));
  return {
    lines,
    totalBronze: lines.reduce((sum, line) => sum + line.bronze, 0),
    unavailable: [...unknown, ...wanted.map((w) => w.materialId).filter((id) => !bought.has(id))],
  };
}

/** Selling follows the player's view of the shop, master included: hiding an item turns it off. */
function isVisibleToPlayers(state: GameState, item: ShopItem): boolean {
  return !item.hidden && tradingPostLevel(state) >= item.minLevel;
}

function isBuyable(state: GameState, item: ShopItem, quantity: number, viewer: Actor): boolean {
  if (quantity > QUANTITY_LIMIT) return false;
  return isOnSale(state, item, viewer) && (item.stock === null || item.stock >= quantity);
}

/** The camp pays every line by the `buyFromShop` rules; if one is refused, nothing is bought. */
export function buyMaterials(
  state: GameState,
  catalog: Catalog,
  lines: readonly { itemId: string; quantity: number }[],
  actor: Actor,
): Outcome {
  const hasEquipmentLine = lines.some(
    ({ itemId }) => state.shop.items.find((i) => i.id === itemId)?.kind === 'equipment',
  );
  if (hasEquipmentLine) return fail('not_for_sale');
  let current = state;
  for (const { itemId, quantity } of lines) {
    const order = { itemId, quantity, payer: CAMP, deliveryId: '' };
    const bought = buyFromShop(current, catalog, order, actor);
    if (!bought.ok) return fail(bought.error);
    current = bought.state;
  }
  return ok(current);
}

/** The camp gets half the base price of the lot, from level 3, for materials the shop lists. */
export function sellToShop(
  state: GameState,
  catalog: Catalog,
  order: { materialId: string; quantity: number },
): Outcome {
  const { materialId, quantity } = order;
  const item = materialItem(state, materialId);
  if (tradingPostLevel(state) < SELL_BACK_LEVEL || !item || !isVisibleToPlayers(state, item)) {
    return fail('not_for_sale');
  }
  const held = state.materials.items.find((m) => m.id === materialId);
  if (!held) return fail('not_found');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > held.quantity) {
    return fail('invalid_quantity');
  }

  const bronze = sellBackBronze(item, quantity, catalog);
  const paid = setWallet(
    addStock(state, materialId, -quantity),
    CAMP,
    addCoins(state.wallets.camp, fromBronze(bronze, catalog.currencies)),
  );
  return ok(
    withLog(paid, { day: state.day, kind: 'shop_sold', material: held.name, quantity, bronze }),
  );
}

function materialItem(state: GameState, materialId: string): ShopItem | undefined {
  return state.shop.items.find((i) => i.kind === 'material' && i.materialId === materialId);
}

const refuse = (error: ActionError): PurchaseOutcome => ({ ok: false, error });

function charge(state: GameState, catalog: Catalog, payer: WalletRef, costBronze: number): Outcome {
  const wallet = walletOf(state, payer);
  if (!wallet) return fail('not_found');
  const payment = pay(wallet, costBronze, catalog.currencies);
  return payment.ok ? ok(setWallet(state, payer, payment.wallet)) : fail('insufficient_coins');
}

function withStock(state: GameState, item: ShopItem, stock: number | null): GameState {
  if (stock === item.stock) return state;
  return setItems(
    state,
    state.shop.items.map((i) => (i.id === item.id ? { ...i, stock } : i)),
  );
}

/** Adds (or, negative, removes) the units without a `material_adjusted` entry: the purchase has its own. */
function addStock(state: GameState, materialId: string, quantity: number): GameState {
  const items = state.materials.items.map((m) =>
    m.id === materialId ? { ...m, quantity: m.quantity + quantity } : m,
  );
  return setMaterials(state, { ...state.materials, items });
}

function equipmentDelivery(
  item: Extract<ShopItem, { kind: 'equipment' }>,
  order: PurchaseOrder,
  actor: Actor,
): DepotDelivery | null {
  const authorId = depotAuthorOf(actor);
  if (authorId === undefined) return null;
  return {
    itemId: order.deliveryId,
    ownerId: actor.role === 'master' ? null : authorId,
    authorId,
    name: item.name,
    kind: item.depotKind,
    quantity: order.quantity,
    notes: item.description,
  };
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
