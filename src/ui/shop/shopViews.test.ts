import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../../model/schema';
import { shopEntries, type ShopEntry } from '../../systems/Shop';
import { makeState, testCatalog } from '../../systems/testFixtures';
import { filterEntries, parseDiscount, shopCardModel } from './shopViews';

const master = { role: 'master' } as const;

type MaterialItem = Extract<ShopItem, { kind: 'material' }>;

function item(id: string, overrides: Partial<MaterialItem> = {}): MaterialItem {
  return {
    id,
    kind: 'material',
    materialId: 'wood',
    price: { silver: 1 },
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
    ...overrides,
  };
}

function entriesOf(...items: ShopItem[]): ShopEntry[] {
  const state = { ...makeState(), shop: { items } };
  return shopEntries(state, testCatalog, master);
}

function cardOf(shopItem: ShopItem) {
  const [entry] = entriesOf(shopItem);
  if (!entry) throw new Error('fixture item is not on sale');
  return shopCardModel(entry, testCatalog);
}

describe('filterEntries', () => {
  it('filtersBasicsAsInfiniteStock', () => {
    const entries = entriesOf(item('basic', { stock: null }), item('rare', { stock: 4 }));
    const idsOf = (filter: Parameters<typeof filterEntries>[1]) =>
      filterEntries(entries, filter).map((e) => e.item.id);
    expect(idsOf('tudo')).toEqual(['basic', 'rare']);
    expect(idsOf('basicos')).toEqual(['basic']);
    expect(idsOf('raros')).toEqual(['rare']);
  });
});

describe('shopCardModel', () => {
  it('marksOutOfStockCard', () => {
    const model = cardOf(item('rare', { stock: 0 }));
    expect(model.isOut).toBe(true);
    expect(model.stockText).toBe(0);
  });

  it('showsInfiniteStockAndPlainPrice', () => {
    const model = cardOf(item('basic'));
    expect(model).toMatchObject({ isOut: false, stockText: '∞', priceText: '1 Prata' });
    expect(model.ribbon).toBeUndefined();
    expect(model.oldPriceText).toBeUndefined();
  });

  it('showsPromotionRibbonAndOldPrice', () => {
    const model = cardOf(item('sale', { discountPercent: 25 }));
    expect(model.ribbon).toBe('−25%');
    expect(model.oldPriceText).toBe('1 Prata');
    expect(model.priceText).toBe('7 Bronze');
    expect(model.oldPrice).toEqual({ silver: 1 });
    expect(model.price).toEqual({ bronze: 7 });
  });
});

describe('parseDiscount', () => {
  it.each([
    ['1', 1],
    ['90', 90],
    ['25', 25],
    ['0', null],
    ['91', null],
    ['12.5', null],
    ['', null],
    ['abc', null],
  ])('reads %j as %s', (text, expected) => {
    expect(parseDiscount(text)).toBe(expected);
  });
});
