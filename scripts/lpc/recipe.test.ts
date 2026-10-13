import { describe, expect, it } from 'vitest';
import type { Catalog, CatalogItem } from './catalog';
import { recipeProblems, spritesheetFolders, type Recipe } from './recipe';

function item(fields: Partial<CatalogItem> & Pick<CatalogItem, 'id' | 'typeName'>): CatalogItem {
  return {
    name: fields.id,
    category: [],
    bodyTypes: ['male', 'female'],
    animations: ['walk'],
    variants: [],
    recolors: [],
    layers: [],
    ...fields,
  };
}

const catalog: Catalog = {
  bodyTypes: ['male', 'female', 'child'],
  items: new Map(
    [
      item({
        id: 'body',
        typeName: 'body',
        recolors: [{ typeName: null, label: 'Skintone', colors: ['light', 'amber'] }],
        layers: [{ male: 'body/bodies/male/', female: 'body/bodies/female/' }],
      }),
      item({
        id: 'hair_long',
        typeName: 'hair',
        recolors: [{ typeName: null, label: 'Hair', colors: ['red', 'gold'] }],
        layers: [{ female: 'hair/long/adult/fg/' }, { female: 'hair/long/adult/bg/' }],
      }),
      item({ id: 'dress_bodice', typeName: 'vest', bodyTypes: ['female'], variants: ['blue'] }),
      item({
        id: 'face_neutral',
        typeName: 'expression',
        layers: [{ female: 'head/faces/${head}/neutral/' }],
      }),
      item({
        id: 'tool_axe',
        typeName: 'weapon',
        recolors: [
          { typeName: null, label: 'Metal', colors: ['iron'] },
          { typeName: 'handle', label: 'Handle', colors: ['oak'] },
        ],
      }),
    ].map((entry) => [entry.id, entry]),
  ),
};

function recipe(selections: Recipe['selections'], bodyType = 'female'): Recipe {
  return { version: 2, bodyType, selections };
}

describe('recipeProblems', () => {
  it('accepts pieces, variants and recolors that exist', () => {
    const valid = recipe({
      body: { itemId: 'body', variant: '', recolor: 'light' },
      hair: { itemId: 'hair_long', variant: '', recolor: 'gold' },
      vest: { itemId: 'dress_bodice', variant: 'blue', recolor: '' },
      weapon: { itemId: 'tool_axe', subId: null, recolor: 'iron' },
      handle: { itemId: 'tool_axe', subId: 1, recolor: 'oak' },
    });
    expect(recipeProblems(valid, catalog)).toEqual([]);
  });

  it.each([
    {
      case: 'unknown item, with similar ids',
      selections: { hair: { itemId: 'hair_short', recolor: 'red' } },
      problem: 'selections.hair: item "hair_short" does not exist; similar: hair_long',
    },
    {
      case: 'unknown recolor, with the colors that exist',
      selections: { hair: { itemId: 'hair_long', recolor: 'neon' } },
      problem: 'selections.hair (hair_long): recolor "neon" does not exist; options: red, gold',
    },
    {
      case: 'missing recolor',
      selections: { hair: { itemId: 'hair_long' } },
      problem: 'selections.hair (hair_long): a recolor is required; options: red, gold',
    },
    {
      case: 'unknown variant',
      selections: { vest: { itemId: 'dress_bodice', variant: 'plaid' } },
      problem: 'selections.vest (dress_bodice): variant "plaid" does not exist; options: blue',
    },
    {
      case: 'recolor on an item without recolors',
      selections: { vest: { itemId: 'dress_bodice', variant: 'blue', recolor: 'red' } },
      problem: 'selections.vest (dress_bodice): recolor "red" given, but the item has no recolors',
    },
    {
      case: 'wrong selection key',
      selections: { jacket: { itemId: 'dress_bodice', variant: 'blue' } },
      problem: 'selections.jacket (dress_bodice): must sit under selections.vest',
    },
    {
      case: 'recolor of a sub-selection',
      selections: { handle: { itemId: 'tool_axe', subId: 1, recolor: 'iron' } },
      problem: 'selections.handle (tool_axe): recolor "iron" does not exist; options: oak',
    },
  ])('reports $case', ({ selections, problem }) => {
    expect(recipeProblems(recipe(selections), catalog)).toEqual([problem]);
  });

  it('reports an item not made for the body type', () => {
    const child = recipe({ vest: { itemId: 'dress_bodice', variant: 'blue' } }, 'child');
    expect(recipeProblems(child, catalog)).toEqual([
      'selections.vest (dress_bodice): not made for bodyType "child"; made for: female',
    ]);
  });

  it('reports an unknown body type with the options', () => {
    expect(recipeProblems(recipe({}, 'giant'), catalog)).toEqual([
      'bodyType "giant" does not exist; options: male, female, child',
    ]);
  });
});

describe('spritesheetFolders', () => {
  it('lists the folders of every layer for the body type, cut before placeholders', () => {
    const folders = spritesheetFolders(
      recipe({
        body: { itemId: 'body', recolor: 'light' },
        hair: { itemId: 'hair_long', recolor: 'red' },
        expression: { itemId: 'face_neutral' },
      }),
      catalog,
    );
    expect(folders).toEqual([
      'body/bodies/female/',
      'hair/long/adult/bg/',
      'hair/long/adult/fg/',
      'head/faces/',
    ]);
  });
});
