import { describe, expect, it } from 'vitest';
import type { MenuItem } from '../model/schema';
import { dishLevel, isDishAvailable, menuFor } from './TavernMenu';

const dish = (id: string, meal: MenuItem['meal'], minLevel?: number): MenuItem => ({
  id,
  meal,
  name: id,
  description: id,
  image: `menu.${id}`,
  ...(minLevel === undefined ? {} : { minLevel }),
});

describe('tavern menu', () => {
  const menu = {
    items: [dish('pao', 'breakfast'), dish('sopa', 'lunch'), dish('ovos', 'breakfast', 2)],
  };

  it('lists the dishes of one meal in file order', () => {
    expect(menuFor(menu, 'breakfast').map((item) => item.id)).toEqual(['pao', 'ovos']);
    expect(menuFor(menu, 'dinner')).toEqual([]);
  });

  it.each([
    { minLevel: undefined, level: 1, available: true },
    { minLevel: 2, level: 1, available: false },
    { minLevel: 2, level: 2, available: true },
    { minLevel: 2, level: 3, available: true },
  ])(
    'serves a dish needing $minLevel at level $level: $available',
    ({ minLevel, level, available }) => {
      const item = dish('x', 'lunch', minLevel);
      expect(dishLevel(item)).toBe(minLevel ?? 1);
      expect(isDishAvailable(item, level)).toBe(available);
    },
  );
});
