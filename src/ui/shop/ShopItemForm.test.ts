import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../../model/schema';
import { makeState } from '../../systems/testFixtures';
import { buildFields, materialOptions, parseStock, priceBag } from './ShopItemForm';

function listed(id: string, materialId: string): ShopItem {
  return {
    id,
    kind: 'material',
    materialId,
    price: { bronze: 1 },
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
  };
}

describe('materialOptions', () => {
  const base = makeState();
  const [first, second] = base.materials.items;
  if (!first || !second) throw new Error('fixture needs two materials');
  const state = { ...base, shop: { items: [listed('s1', first.id)] } };

  it('skipsListedMaterials', () => {
    const ids = materialOptions(state).map((option) => option.value);
    expect(ids).not.toContain(first.id);
    expect(ids).toContain(second.id);
  });

  it('keepsTheMaterialOfTheItemBeingEdited', () => {
    const ids = materialOptions(state, state.shop.items[0]).map((option) => option.value);
    expect(ids).toContain(first.id);
  });
});

describe('parseStock', () => {
  it.each([
    [true, '12', null],
    [false, '12', 12],
    [false, '0', 0],
    [false, 'abc', 0],
  ])('infinite=%s text=%s gives %s', (isInfinite, text, expected) => {
    expect(parseStock(isInfinite, text)).toBe(expected);
  });
});

describe('priceBag', () => {
  it('buildsCoinBagOmittingZeros', () => {
    expect(priceBag({ gold: '', silver: '1', bronze: '5' })).toEqual({ silver: 1, bronze: 5 });
  });
});

describe('buildFields', () => {
  const common = {
    price: { silver: 1 },
    isInfinite: true,
    stockText: '3',
    minLevel: 2,
    featured: true,
    hidden: false,
  };

  it('sendsNullStockWhenInfinite', () => {
    const fields = buildFields({ ...common, kind: 'material', materialId: 'wood' });
    expect(fields).toMatchObject({ kind: 'material', materialId: 'wood', stock: null });
  });

  it('buildsEquipmentWithNameAndDepotKind', () => {
    const fields = buildFields({
      ...common,
      isInfinite: false,
      kind: 'equipment',
      name: 'Espada Rúnica',
      description: 'Brilha',
      depotKind: 'equipamento',
    });
    expect(fields).toMatchObject({ kind: 'equipment', name: 'Espada Rúnica', stock: 3 });
  });
});
