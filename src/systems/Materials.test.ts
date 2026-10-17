import { describe, expect, it } from 'vitest';
import {
  addMaterial,
  addMaterialCategory,
  adjustMaterial,
  materialNeeds,
  removeMaterial,
  removeMaterialCategory,
  totalMaterialUnits,
  updateMaterial,
} from './Materials';
import { makeState, withIron } from './testFixtures';

describe('addMaterial', () => {
  it('adds a material with the given id and logs it', () => {
    const result = addMaterial(makeState({ day: 14 }), {
      id: 'mat_1',
      name: 'Pedra da Lua',
      category: 'ores',
      description: '  ',
      quantity: 3,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.materials.items.at(-1)).toEqual({
      id: 'mat_1',
      name: 'Pedra da Lua',
      category: 'ores',
      quantity: 3,
    });
    expect(result.state.log).toEqual([
      { day: 14, kind: 'material_added', material: 'Pedra da Lua' },
    ]);
  });

  it.each([
    {
      name: 'a duplicate name',
      fields: { name: 'ferro', category: 'ores' },
      error: 'duplicate_name',
    },
    { name: 'an unknown category', fields: { name: 'Gema', category: 'x' }, error: 'not_found' },
    {
      name: 'a taken id',
      fields: { id: 'iron', name: 'Gema', category: 'ores' },
      error: 'duplicate_id',
    },
  ])('refuses $name', ({ fields, error }) => {
    const material = { id: 'mat_1', ...fields, quantity: 0 };
    expect(addMaterial(makeState(), material)).toEqual({ ok: false, error });
  });
});

describe('adjustMaterial', () => {
  it('adds and removes units, never below zero, logging the applied change', () => {
    const result = adjustMaterial(withIron(4, { day: 14 }), 'iron', -10);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.materials.items[0]?.quantity).toBe(0);
    expect(result.state.log).toEqual([
      { day: 14, kind: 'material_adjusted', material: 'Ferro', delta: -4, requested: -10 },
    ]);
  });

  it('logs no request when the removal fits the stock', () => {
    const result = adjustMaterial(withIron(4), 'iron', -3);
    expect(result.ok && result.state.log.at(-1)).not.toHaveProperty('requested');
  });

  it('refuses an adjustment that changes nothing', () => {
    expect(adjustMaterial(withIron(0), 'iron', -2)).toEqual({
      ok: false,
      error: 'nothing_changed',
    });
  });
});

describe('updateMaterial and removeMaterial', () => {
  it('edits the fields but keeps id and quantity', () => {
    const result = updateMaterial(withIron(9), 'iron', {
      name: 'Ferro Negro',
      category: 'ores',
      icon: 'icon.iron',
    });
    expect(result.ok && result.state.materials.items[0]).toEqual({
      id: 'iron',
      name: 'Ferro Negro',
      category: 'ores',
      icon: 'icon.iron',
      quantity: 9,
    });
  });

  it('removes and logs', () => {
    const result = removeMaterial(makeState(), 'iron');
    expect(result.ok && result.state.materials.items.map((m) => m.id)).toEqual([
      'wood',
      'aetherium',
    ]);
    expect(result.ok && result.state.log.at(-1)).toMatchObject({ kind: 'material_removed' });
  });
});

describe('material categories', () => {
  it('only removes empty categories', () => {
    expect(removeMaterialCategory(makeState(), 'ores')).toEqual({
      ok: false,
      error: 'category_not_empty',
    });
    const added = addMaterialCategory(makeState(), { id: 'gems', name: 'Gemas' });
    if (!added.ok) throw new Error(added.error);
    const removed = removeMaterialCategory(added.state, 'gems');
    expect(removed.ok && removed.state.materials.categories).toEqual([
      { id: 'ores', name: 'Minérios' },
    ]);
  });
});

describe('materialNeeds', () => {
  it('splits shortfalls from materials that do not exist', () => {
    expect(materialNeeds(withIron(3).materials, { iron: 5, ghost: 1, wood: 0 })).toEqual({
      missing: { iron: 2 },
      unknown: ['ghost'],
    });
  });

  it('counts every unit for the top bar', () => {
    expect(totalMaterialUnits(withIron(12).materials)).toBe(12);
  });
});
