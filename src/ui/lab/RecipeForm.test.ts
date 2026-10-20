import { describe, expect, it } from 'vitest';
import {
  potionsFirst,
  recipeFormValues,
  type RecipeDraft,
  type RecipeFormReason,
} from './RecipeForm';

const draft: RecipeDraft = {
  outputKey: 'd:cura',
  outputQty: 2,
  ingredients: [
    { key: 'm:hortela', quantity: 3 },
    { key: 'm:camomila', quantity: 1 },
  ],
  stationType: 'alambique',
  days: 1,
  color: undefined,
  hidden: true,
};

describe('recipeFormValues', () => {
  const refusals: [string, Partial<RecipeDraft>, RecipeFormReason][] = [
    ['noPotion', { outputKey: '' }, 'missing_material'],
    ['emptyIngredientRow', { ingredients: [{ key: '', quantity: 1 }] }, 'missing_material'],
    ['noIngredients', { ingredients: [] }, 'no_ingredients'],
    [
      'repeatedIngredient',
      {
        ingredients: [
          { key: 'm:hortela', quantity: 1 },
          { key: 'm:hortela', quantity: 2 },
        ],
      },
      'repeated_ingredient',
    ],
    [
      'potionAmongIngredients',
      { ingredients: [{ key: 'd:cura', quantity: 1 }] },
      'output_among_ingredients',
    ],
    ['zeroDays', { days: 0 }, 'out_of_range'],
    ['tooManyDays', { days: 366 }, 'out_of_range'],
    ['fractionalYield', { outputQty: 1.5 }, 'out_of_range'],
    ['zeroQuantity', { ingredients: [{ key: 'm:hortela', quantity: 0 }] }, 'out_of_range'],
  ];
  it.each(refusals)('refuses %s', (_name, change, reason) => {
    expect(recipeFormValues({ ...draft, ...change })).toEqual({ ok: false, reason });
  });

  it('refusesASeventhIngredient', () => {
    const ingredients = Array.from({ length: 7 }, (_, i) => ({ key: `m:m${i}`, quantity: 1 }));
    expect(recipeFormValues({ ...draft, ingredients })).toEqual({
      ok: false,
      reason: 'too_many_ingredients',
    });
  });

  it('buildsTheRecipeFields', () => {
    expect(recipeFormValues(draft)).toEqual({
      ok: true,
      recipe: {
        output: { source: 'depot', itemId: 'cura' },
        outputQty: 2,
        ingredients: [
          { ref: { source: 'material', materialId: 'hortela' }, quantity: 3 },
          { ref: { source: 'material', materialId: 'camomila' }, quantity: 1 },
        ],
        stationType: 'alambique',
        days: 1,
        hidden: true,
      },
    });
  });

  it('acceptsAMaterialWithThePotionItemId', () => {
    const ingredients = [{ key: 'm:cura', quantity: 1 }];
    expect(recipeFormValues({ ...draft, ingredients }).ok).toBe(true);
  });

  it('keepsTheChosenColor', () => {
    const result = recipeFormValues({ ...draft, color: '#aa3355' });
    expect(result.ok && result.recipe.color).toBe('#aa3355');
  });
});

describe('potionsFirst', () => {
  it('putsThePotionCategoryFirst', () => {
    const categories = [
      { id: 'ores', name: 'Minérios' },
      { id: 'herbs', name: 'Ervas' },
      { id: 'pots', name: 'Poções' },
    ];
    expect(potionsFirst(categories).map((c) => c.id)).toEqual(['pots', 'ores', 'herbs']);
  });

  it('keepsTheOrderWithoutAPotionCategory', () => {
    const categories = [
      { id: 'ores', name: 'Minérios' },
      { id: 'herbs', name: 'ervas' },
    ];
    expect(potionsFirst(categories)).toEqual(categories);
  });
});
