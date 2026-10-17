import { describe, expect, it } from 'vitest';
import type { GameState, ShopItem } from '../model/schema';
import type { Outcome } from './outcome';
import {
  addShopItem,
  isOnSale,
  removeShopItem,
  sellBackBronze,
  setShopPromotion,
  shopEntries,
  tradingPostLevel,
  unitPriceBronze,
  updateShopItem,
} from './Shop';
import { makeState, testCatalog } from './testFixtures';

const player = { role: 'player' } as const;
const master = { role: 'master' } as const;

type MaterialItem = Extract<ShopItem, { kind: 'material' }>;

function material(price: Record<string, number>, discountPercent?: number): MaterialItem {
  return {
    id: 'shop_x',
    kind: 'material',
    materialId: 'wood',
    price,
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
    ...(discountPercent === undefined ? {} : { discountPercent }),
  };
}

function withTradingPost(level: number, overrides: Partial<GameState> = {}): GameState {
  return makeState({
    slots: { s1: { buildingId: 'trading_post', level, status: 'done' } },
    ...overrides,
  });
}

function withItems(state: GameState, items: ShopItem[]): GameState {
  return { ...state, shop: { items } };
}

describe('unitPriceBronze', () => {
  it.each([
    { price: { bronze: 3 }, discount: undefined, expected: 3 },
    { price: { bronze: 3 }, discount: 25, expected: 2 },
    { price: { bronze: 3 }, discount: 90, expected: 1 },
    { price: { silver: 5 }, discount: 10, expected: 45 },
  ])('prices $price with discount $discount at $expected', ({ price, discount, expected }) => {
    expect(unitPriceBronze(material(price, discount), testCatalog)).toBe(expected);
  });
});

describe('sellBackBronze', () => {
  it.each([
    { price: { bronze: 3 }, quantity: 10, discount: undefined, expected: 15 },
    { price: { silver: 5 }, quantity: 3, discount: undefined, expected: 75 },
    { price: { bronze: 3 }, quantity: 10, discount: 50, expected: 15 },
  ])('pays $expected for $quantity of $price', ({ price, quantity, discount, expected }) => {
    expect(sellBackBronze(material(price, discount), quantity, testCatalog)).toBe(expected);
  });
});

describe('shopEntries', () => {
  const base = material({ bronze: 3 });

  it('hidesItemsAboveLevelFromPlayers', () => {
    const state = withItems(withTradingPost(1), [{ ...base, minLevel: 2 }]);
    expect(shopEntries(state, testCatalog, player)).toEqual([]);
  });

  it('showsLockedItemsToMaster', () => {
    const state = withItems(withTradingPost(1), [
      { ...base, minLevel: 2 },
      { ...base, id: 'shop_y', hidden: true },
    ]);
    const entries = shopEntries(state, testCatalog, master);
    expect(entries.map((e) => e.isLocked)).toEqual([true, false]);
    expect(entries).toHaveLength(2);
  });

  it('hidesItemsWhoseMaterialIsGone', () => {
    const state = withItems(withTradingPost(1), [{ ...base, materialId: 'gone' }]);
    expect(shopEntries(state, testCatalog, player)).toEqual([]);
    expect(shopEntries(state, testCatalog, master)).toEqual([]);
  });

  it('hidesEverythingWithoutTradingPost', () => {
    expect(shopEntries(makeState(), testCatalog, player)).toEqual([]);
  });

  it('resolvesNameBasicFlagAndDiscountedPrice', () => {
    const state = withItems(withTradingPost(1), [{ ...base, discountPercent: 25 }]);
    const [entry] = shopEntries(state, testCatalog, player);
    expect(entry).toMatchObject({ name: 'Madeira', unitBronze: 2, isBasic: true, isLocked: false });
  });

  it('prefersItemImageOverMaterialIcon', () => {
    const state = withItems(withTradingPost(1), [{ ...base, image: 'custom.png' }]);
    expect(shopEntries(state, testCatalog, player)[0]?.image).toBe('custom.png');
  });
});

describe('isOnSale', () => {
  it('hidesHiddenItemsFromPlayersOnly', () => {
    const state = withTradingPost(1);
    const item = { ...material({ bronze: 3 }), hidden: true };
    expect(isOnSale(state, item, player)).toBe(false);
    expect(isOnSale(state, item, master)).toBe(true);
  });
});

describe('tradingPostLevel', () => {
  it('reportsZeroWhenNotBuilt', () => {
    expect(tradingPostLevel(makeState())).toBe(0);
    expect(tradingPostLevel(withTradingPost(2))).toBe(2);
  });
});

describe('shop item edits', () => {
  const equipment = {
    kind: 'equipment',
    name: 'Espada longa',
    description: '',
    depotKind: 'equipamento',
    price: { silver: 8 },
    stock: 2,
    minLevel: 2,
    featured: false,
    hidden: false,
  } as const;
  const materialFields = {
    kind: 'material',
    materialId: 'wood',
    price: { bronze: 4 },
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
  } as const;

  function unwrap(outcome: Outcome): GameState {
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.state;
  }

  it('addsEquipmentAndMaterialItems', () => {
    const state = makeState();
    const added = unwrap(addShopItem(state, { id: 'shop_sword', ...equipment }));
    expect(added.shop.items.at(-1)).toEqual({ id: 'shop_sword', ...equipment });
    const free = unwrap(removeShopItem(state, 'shop_wood'));
    const readded = unwrap(addShopItem(free, { id: 'shop_wood2', ...materialFields }));
    expect(readded.shop.items.at(-1)).toMatchObject({ id: 'shop_wood2', materialId: 'wood' });
  });

  it('trimsTheEquipmentName', () => {
    const state = unwrap(addShopItem(makeState(), { id: 's', ...equipment, name: '  Adaga  ' }));
    expect(state.shop.items.at(-1)).toMatchObject({ name: 'Adaga' });
  });

  it('rejectsSecondItemForSameMaterial', () => {
    const state = makeState();
    expect(addShopItem(state, { id: 'shop_dup', ...materialFields })).toEqual({
      ok: false,
      error: 'material_already_listed',
    });
    expect(updateShopItem(state, 'shop_iron', materialFields)).toEqual({
      ok: false,
      error: 'material_already_listed',
    });
  });

  it('keepsTheSameMaterialOnUpdate', () => {
    const state = unwrap(updateShopItem(makeState(), 'shop_wood', materialFields));
    expect(state.shop.items[0]).toMatchObject({ id: 'shop_wood', price: { bronze: 4 } });
  });

  it('rejectsMaterialItemForUnknownMaterial', () => {
    const fields = { ...materialFields, materialId: 'ghost' };
    expect(addShopItem(makeState(), { id: 's', ...fields })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('rejectsEmptyEquipmentName', () => {
    expect(addShopItem(makeState(), { id: 's', ...equipment, name: '   ' })).toEqual({
      ok: false,
      error: 'empty_name',
    });
  });

  it('rejectsDuplicateItemId', () => {
    expect(addShopItem(makeState(), { id: 'shop_wood', ...equipment })).toEqual({
      ok: false,
      error: 'duplicate_id',
    });
  });

  it('keepsPromotionAndImageOnUpdate', () => {
    const base = unwrap(addShopItem(makeState(), { id: 's', ...equipment }));
    const decorated = unwrap(setShopPromotion(base, 's', 20));
    const withImage = {
      ...decorated,
      shop: { items: decorated.shop.items.map((i) => (i.id === 's' ? { ...i, image: 'x' } : i)) },
    };
    const updated = unwrap(updateShopItem(withImage, 's', { ...equipment, stock: 5 }));
    expect(updated.shop.items.at(-1)).toMatchObject({ stock: 5, discountPercent: 20, image: 'x' });
  });

  it('reportsUnknownItemsAsNotFound', () => {
    const state = makeState();
    expect(updateShopItem(state, 'ghost', equipment)).toEqual({ ok: false, error: 'not_found' });
    expect(removeShopItem(state, 'ghost')).toEqual({ ok: false, error: 'not_found' });
    expect(setShopPromotion(state, 'ghost', 10)).toEqual({ ok: false, error: 'not_found' });
  });

  it('removesAnItem', () => {
    const state = unwrap(removeShopItem(makeState(), 'shop_wood'));
    expect(state.shop.items.map((i) => i.id)).toEqual(['shop_iron', 'shop_aetherium']);
  });

  it('setsAndClearsPromotion', () => {
    const promoted = unwrap(setShopPromotion(makeState(), 'shop_wood', 25));
    expect(promoted.shop.items[0]).toMatchObject({ discountPercent: 25 });
    const cleared = unwrap(setShopPromotion(promoted, 'shop_wood', null));
    expect(cleared.shop.items[0]).not.toHaveProperty('discountPercent');
    const state = makeState();
    expect(unwrap(setShopPromotion(state, 'shop_wood', null))).toBe(state);
  });
});
