import { describe, expect, it } from 'vitest';
import type { GameState, ShopItem } from '../model/schema';
import { isOnSale, sellBackBronze, shopEntries, tradingPostLevel, unitPriceBronze } from './Shop';
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
