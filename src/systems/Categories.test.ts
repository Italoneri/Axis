import { describe, expect, it } from 'vitest';
import { addCategory, removeCategory, renameCategory } from './Categories';

describe('categories', () => {
  const categories = [{ id: 'ores', name: 'Minérios' }];

  it('adds, renames and removes empty categories', () => {
    expect(addCategory(categories, { id: 'gems', name: ' Gemas ' })).toEqual({
      ok: true,
      categories: [...categories, { id: 'gems', name: 'Gemas' }],
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
      result: addCategory(categories, { id: 'ores2', name: 'minérios' }),
      error: 'duplicate_name',
    },
    {
      name: 'blank name',
      result: addCategory(categories, { id: 'b', name: '  ' }),
      error: 'empty_name',
    },
    {
      name: 'taken id',
      result: addCategory(categories, { id: 'ores', name: 'Gemas' }),
      error: 'duplicate_id',
    },
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
