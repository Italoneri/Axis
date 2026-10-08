import { describe, expect, it } from 'vitest';
import { addCategory, removeCategory, renameCategory, slugify, uniqueId } from './Categories';

describe('slugify and uniqueId', () => {
  it.each([
    { name: 'Lâminas Rúnicas', slug: 'laminas_runicas' },
    { name: '  Pedra-da-Lua!  ', slug: 'pedra_da_lua' },
    { name: 'Açaí 2', slug: 'acai_2' },
  ])('turns "$name" into "$slug"', ({ name, slug }) => {
    expect(slugify(name)).toBe(slug);
  });

  it('suffixes taken ids and falls back for names without letters', () => {
    expect(uniqueId('Ferro', ['ferro', 'ferro_2'])).toBe('ferro_3');
    expect(uniqueId('???', [])).toBe('item');
  });
});

describe('categories', () => {
  const categories = [{ id: 'ores', name: 'Minérios' }];

  it('adds, renames and removes empty categories', () => {
    expect(addCategory(categories, ' Gemas ')).toEqual({
      ok: true,
      categories: [...categories, { id: 'gemas', name: 'Gemas' }],
    });
    expect(renameCategory(categories, 'ores', 'Metais')).toEqual({
      ok: true,
      categories: [{ id: 'ores', name: 'Metais' }],
    });
    expect(removeCategory(categories, 'ores', false)).toEqual({ ok: true, categories: [] });
  });

  it.each([
    {
      name: 'duplicate name',
      result: addCategory(categories, 'minérios'),
      error: 'duplicate_name',
    },
    { name: 'blank name', result: addCategory(categories, '  '), error: 'empty_name' },
    { name: 'unknown id', result: renameCategory(categories, 'x', 'Y'), error: 'not_found' },
    {
      name: 'category in use',
      result: removeCategory(categories, 'ores', true),
      error: 'category_not_empty',
    },
  ])('refuses a $name', ({ result, error }) => {
    expect(result).toEqual({ ok: false, error });
  });
});
