import { describe, expect, it } from 'vitest';
import type { GameState, ShopItem } from '../model/schema';
import type { Outcome } from './outcome';
import {
  addShopItem,
  buyFromShop,
  buyMaterials,
  isOnSale,
  missingPurchase,
  removeShopItem,
  sellBackBronze,
  sellToShop,
  setShopPromotion,
  shopEntries,
  tradingPostLevel,
  unitPriceBronze,
  updateShopItem,
} from './Shop';
import { toBronze } from './Coins';
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

describe('buyFromShop', () => {
  const thorin = { role: 'player', characterId: 'thorin' } as const;
  const camp = { kind: 'camp' } as const;
  const own = { kind: 'character', characterId: 'thorin' } as const;
  const sword: ShopItem = {
    id: 'shop_sword',
    kind: 'equipment',
    name: 'Espada longa',
    description: '1d8',
    depotKind: 'equipamento',
    price: { silver: 8 },
    stock: 2,
    minLevel: 1,
    featured: false,
    hidden: false,
  };

  function shopState(level = 1, items: ShopItem[] = [material({ bronze: 3 }), sword]): GameState {
    return withItems(withTradingPost(level), items);
  }

  function buy(
    state: GameState,
    itemId: string,
    quantity: number,
    payer: typeof camp | typeof own = camp,
    actor: typeof thorin | typeof master = thorin,
  ) {
    const outcome = buyFromShop(
      state,
      testCatalog,
      { itemId, quantity, payer, deliveryId: 'd1' },
      actor,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome;
  }

  const woodStock = (state: GameState) =>
    state.materials.items.find((m) => m.id === 'wood')?.quantity;
  const campBronze = (state: GameState) => toBronze(state.wallets.camp, testCatalog.currencies);

  it('addsMaterialToCampStock', () => {
    const before = shopState();
    const { state, delivery } = buy(before, 'shop_x', 12);
    expect(woodStock(state)).toBe((woodStock(before) ?? 0) + 12);
    expect(campBronze(before) - campBronze(state)).toBe(36);
    expect(delivery).toBeNull();
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'shop_purchased',
      quantity: 12,
      bronze: 36,
      item: 'Madeira',
    });
    expect(state.log).toHaveLength(1);
  });

  it('paysFromOwnWallet', () => {
    const before = shopState();
    const { state } = buy(before, 'shop_x', 2, own);
    expect(toBronze(state.wallets.characters['thorin'] ?? {}, testCatalog.currencies)).toBe(
      500 - 6,
    );
    expect(state.wallets.camp).toEqual(before.wallets.camp);
    expect(state.log.at(-1)).toMatchObject({ bronze: 6, wallet: 'Thorin' });
  });

  it('refusesQuantityAboveStock', () => {
    const state = shopState();
    const outcome = buyFromShop(
      state,
      testCatalog,
      { itemId: 'shop_sword', quantity: 3, payer: camp, deliveryId: 'd1' },
      thorin,
    );
    expect(outcome).toEqual({ ok: false, error: 'out_of_stock' });
    expect(state.shop.items.find((i) => i.id === 'shop_sword')?.stock).toBe(2);
  });

  it('decrementsLimitedStock', () => {
    const { state } = buy(shopState(), 'shop_sword', 1);
    expect(state.shop.items.find((i) => i.id === 'shop_sword')?.stock).toBe(1);
  });

  it('keepsInfiniteStockNull', () => {
    const { state } = buy(shopState(), 'shop_x', 5);
    expect(state.shop.items.find((i) => i.id === 'shop_x')?.stock).toBeNull();
  });

  it('chargesDiscountedPrice', () => {
    const before = shopState(1, [material({ bronze: 3 }, 25)]);
    const { state } = buy(before, 'shop_x', 10);
    expect(campBronze(before) - campBronze(state)).toBe(20);
  });

  it('refusesWithoutTradingPost', () => {
    const state = withItems(makeState(), [material({ bronze: 3 })]);
    const order = { itemId: 'shop_x', quantity: 1, payer: camp, deliveryId: 'd1' };
    expect(buyFromShop(state, testCatalog, order, thorin)).toEqual({
      ok: false,
      error: 'not_for_sale',
    });
  });

  it('refusesUnknownItem', () => {
    const order = { itemId: 'ghost', quantity: 1, payer: camp, deliveryId: 'd1' };
    expect(buyFromShop(shopState(), testCatalog, order, thorin)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it.each([0, -1, 1.5, 100_000])('refusesQuantity %s', (quantity) => {
    const order = { itemId: 'shop_x', quantity, payer: camp, deliveryId: 'd1' };
    expect(buyFromShop(shopState(), testCatalog, order, thorin)).toEqual({
      ok: false,
      error: 'invalid_quantity',
    });
  });

  it('refusesWhenWalletCannotPay', () => {
    const order = { itemId: 'shop_sword', quantity: 2, payer: own, deliveryId: 'd1' };
    const poor = { ...shopState(), wallets: { camp: {}, characters: { thorin: { bronze: 10 } } } };
    expect(buyFromShop(poor, testCatalog, order, thorin)).toEqual({
      ok: false,
      error: 'insufficient_coins',
    });
  });

  it('masterBuysFreeIntoGroupDepot', () => {
    const before = shopState();
    const { state, delivery } = buy(before, 'shop_sword', 1, camp, master);
    expect(delivery).toEqual({
      itemId: 'd1',
      ownerId: null,
      authorId: 'mestre',
      name: 'Espada longa',
      kind: 'equipamento',
      quantity: 1,
      notes: '1d8',
    });
    expect(state.wallets).toEqual(before.wallets);
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'shop_purchased',
      quantity: 1,
      bronze: 0,
      item: 'Espada longa',
    });
  });

  it('playerEquipmentGoesToPrivateArea', () => {
    const { delivery } = buy(shopState(), 'shop_sword', 1);
    expect(delivery).toMatchObject({ ownerId: 'thorin', authorId: 'thorin', name: 'Espada longa' });
  });

  it('logOmitsItemForPrivateDelivery', () => {
    const { state } = buy(shopState(), 'shop_sword', 1);
    expect(state.log.at(-1)).toEqual({ day: 1, kind: 'shop_purchased', quantity: 1, bronze: 80 });
  });
});

describe('missing materials and selling back', () => {
  const thorin = { role: 'player', characterId: 'thorin' } as const;
  const forgeLevel2 = { coins: 400, materials: { wood: 108, iron: 72, aetherium: 10 } };

  function stocked(state: GameState, quantities: Record<string, number>): GameState {
    const items = state.materials.items.map((m) => ({ ...m, quantity: quantities[m.id] ?? 0 }));
    return { ...state, materials: { ...state.materials, items } };
  }

  const stockOf = (state: GameState, id: string) =>
    state.materials.items.find((m) => m.id === id)?.quantity;
  const campBronze = (state: GameState) => toBronze(state.wallets.camp, testCatalog.currencies);
  const forgeState = () => stocked(withTradingPost(1), { wood: 96, iron: 72, aetherium: 8 });

  describe('missingPurchase', () => {
    it('pricesWhatTheForgeLacks', () => {
      expect(missingPurchase(forgeState(), testCatalog, forgeLevel2, thorin)).toEqual({
        lines: [
          { itemId: 'shop_wood', materialId: 'wood', quantity: 12, bronze: 36 },
          { itemId: 'shop_aetherium', materialId: 'aetherium', quantity: 2, bronze: 100 },
        ],
        totalBronze: 136,
        unavailable: [],
      });
    });

    it('listsUnsellableMaterialAsUnavailable', () => {
      const hidden = forgeState().shop.items.map((i) =>
        i.id === 'shop_aetherium' ? { ...i, hidden: true } : i,
      );
      const short = hidden.map((i) => (i.id === 'shop_wood' ? { ...i, stock: 5 } : i));
      const result = missingPurchase(
        withItems(forgeState(), short),
        testCatalog,
        forgeLevel2,
        thorin,
      );
      expect(result).toEqual({ lines: [], totalBronze: 0, unavailable: ['wood', 'aetherium'] });
    });

    it('listsMaterialWithoutShopItemAsUnavailable', () => {
      const state = withItems(forgeState(), []);
      const result = missingPurchase(state, testCatalog, forgeLevel2, thorin);
      expect(result.unavailable).toEqual(['wood', 'aetherium']);
    });

    it('skipsItemWhoseMaterialIsGone', () => {
      const gone = {
        ...forgeState(),
        shop: { items: [{ ...material({ bronze: 3 }), materialId: 'ghost' }] },
      };
      const result = missingPurchase(
        gone,
        testCatalog,
        { coins: 0, materials: { ghost: 4 } },
        thorin,
      );
      expect(result.lines).toEqual([]);
      expect(result.unavailable).toEqual(['ghost']);
    });

    it('chargesTheMasterNothing', () => {
      const result = missingPurchase(forgeState(), testCatalog, forgeLevel2, master);
      expect(result.lines.map((l) => l.bronze)).toEqual([0, 0]);
      expect(result.totalBronze).toBe(0);
    });

    it('listsQuantityAboveTheLimitAsUnavailable', () => {
      const huge = { coins: 0, materials: { wood: 200_000 } };
      const result = missingPurchase(forgeState(), testCatalog, huge, thorin);
      expect(result).toEqual({ lines: [], totalBronze: 0, unavailable: ['wood'] });
    });

    it('sumsPromotionalLinesIntoTheTotal', () => {
      const state = forgeState();
      const onSale = withItems(
        state,
        state.shop.items.map((i) =>
          i.id === 'shop_aetherium' ? { ...i, discountPercent: 50 } : i,
        ),
      );
      const result = missingPurchase(onSale, testCatalog, forgeLevel2, thorin);
      expect(result.lines.map((l) => l.bronze)).toEqual([36, 50]);
      expect(result.totalBronze).toBe(result.lines.reduce((sum, l) => sum + l.bronze, 0));
    });
  });

  describe('buyMaterials', () => {
    const lines = [
      { itemId: 'shop_wood', quantity: 12 },
      { itemId: 'shop_aetherium', quantity: 2 },
    ];

    it('buysEveryLineFromTheCamp', () => {
      const before = forgeState();
      const outcome = buyMaterials(before, testCatalog, lines, thorin);
      if (!outcome.ok) throw new Error(outcome.error);
      expect(stockOf(outcome.state, 'wood')).toBe(108);
      expect(stockOf(outcome.state, 'aetherium')).toBe(10);
      expect(campBronze(before) - campBronze(outcome.state)).toBe(136);
      expect(outcome.state.log.map((e) => e.kind)).toEqual(['shop_purchased', 'shop_purchased']);
    });

    it('isAllOrNothingWhenCampIsShort', () => {
      const before = { ...forgeState(), wallets: { camp: { bronze: 40 }, characters: {} } };
      expect(buyMaterials(before, testCatalog, lines, thorin)).toEqual({
        ok: false,
        error: 'insufficient_coins',
      });
    });

    it('refusesEquipmentLine', () => {
      const sword: ShopItem = {
        id: 'shop_sword',
        kind: 'equipment',
        name: 'Espada longa',
        description: '1d8',
        depotKind: 'equipamento',
        price: { silver: 8 },
        stock: 2,
        minLevel: 1,
        featured: false,
        hidden: false,
      };
      const before = withItems(forgeState(), [...forgeState().shop.items, sword]);
      const mixed = [...lines, { itemId: 'shop_sword', quantity: 1 }];
      expect(buyMaterials(before, testCatalog, mixed, thorin)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
    });

    it('refusesALineThatIsNoLongerOnSale', () => {
      const state = forgeState();
      const hidden = withItems(
        state,
        state.shop.items.map((i) => (i.id === 'shop_aetherium' ? { ...i, hidden: true } : i)),
      );
      expect(buyMaterials(hidden, testCatalog, lines, thorin)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
    });
  });

  describe('sellToShop', () => {
    const sale = { materialId: 'wood', quantity: 10 };
    const level3 = () => stocked(withTradingPost(3), { wood: 25 });

    it('paysHalfOnTotalToCamp', () => {
      const before = level3();
      const outcome = sellToShop(before, testCatalog, sale);
      if (!outcome.ok) throw new Error(outcome.error);
      expect(stockOf(outcome.state, 'wood')).toBe(15);
      expect(campBronze(outcome.state) - campBronze(before)).toBe(15);
      expect(outcome.state.log.at(-1)).toEqual({
        day: 1,
        kind: 'shop_sold',
        material: 'Madeira',
        quantity: 10,
        bronze: 15,
      });
    });

    it('ignoresPromotionsWhenPaying', () => {
      const state = level3();
      const onSale = withItems(
        state,
        state.shop.items.map((i) => (i.id === 'shop_wood' ? { ...i, discountPercent: 50 } : i)),
      );
      const outcome = sellToShop(onSale, testCatalog, sale);
      if (!outcome.ok) throw new Error(outcome.error);
      expect(campBronze(outcome.state) - campBronze(onSale)).toBe(15);
    });

    it('refusesBelowLevel3', () => {
      const state = stocked(withTradingPost(2), { wood: 25 });
      expect(sellToShop(state, testCatalog, sale)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
    });

    it('refusesWhenItemHidden', () => {
      const state = level3();
      const hidden = withItems(
        state,
        state.shop.items.map((i) => (i.id === 'shop_wood' ? { ...i, hidden: true } : i)),
      );
      expect(sellToShop(hidden, testCatalog, sale)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
      expect(sellToShop(hidden, testCatalog, sale)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
    });

    it('refusesMasterWhenItemIsLockedAboveTheLevel', () => {
      const state = level3();
      const locked = withItems(
        state,
        state.shop.items.map((i) => (i.id === 'shop_wood' ? { ...i, minLevel: 4 } : i)),
      );
      expect(sellToShop(locked, testCatalog, sale)).toEqual({
        ok: false,
        error: 'not_for_sale',
      });
    });

    it.each([
      { quantity: 26, label: 'more than the stock' },
      { quantity: 0, label: 'zero' },
      { quantity: 1.5, label: 'a fraction' },
    ])('refusesSellingQuantityOf $label', ({ quantity }) => {
      expect(sellToShop(level3(), testCatalog, { materialId: 'wood', quantity })).toEqual({
        ok: false,
        error: 'invalid_quantity',
      });
    });
  });
});
