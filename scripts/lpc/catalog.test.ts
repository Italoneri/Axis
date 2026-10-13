import { describe, expect, it } from 'vitest';
import { searchItems, type Catalog, type CatalogItem } from './catalog';

const item = (id: string, name: string, typeName: string, bodyTypes: string[]): CatalogItem => ({
  id,
  name,
  typeName,
  category: id.startsWith('torso') ? ['torso', 'aprons'] : ['hair'],
  bodyTypes,
  animations: ['walk'],
  variants: [],
  recolors: [],
  layers: [],
});

const catalog: Catalog = {
  bodyTypes: ['male', 'female'],
  items: new Map(
    [
      item('torso_aprons_overalls', 'Overalls', 'overalls', ['male', 'female']),
      item('torso_aprons_apron_half', 'Apron half', 'apron', ['female']),
      item('hair_long', 'Long', 'hair', ['male', 'female']),
    ].map((entry) => [entry.id, entry]),
  ),
};

describe('searchItems', () => {
  it.each([
    {
      terms: ['apron'],
      body: undefined,
      ids: ['torso_aprons_apron_half', 'torso_aprons_overalls'],
    },
    { terms: ['APRON', 'half'], body: undefined, ids: ['torso_aprons_apron_half'] },
    { terms: ['aprons'], body: 'male', ids: ['torso_aprons_overalls'] },
    { terms: ['long'], body: 'female', ids: ['hair_long'] },
    { terms: [], body: 'male', ids: ['hair_long', 'torso_aprons_overalls'] },
  ])('finds $ids for $terms ($body)', ({ terms, body, ids }) => {
    expect(searchItems(catalog, terms, body).map((found) => found.id)).toEqual(ids);
  });
});
