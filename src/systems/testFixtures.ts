import { parseCatalog } from '../model/catalog';
import type { GameState } from '../model/schema';

/** Small catalog independent of the shipped balance numbers, so data tweaks never break tests. */
export const testCatalog = parseCatalog({
  resources: [
    { id: 'gold', name: 'Ouro', icon: 'i', initial: 100 },
    { id: 'arcana', name: 'Essência', icon: 'i', initial: 0 },
  ],
  buildings: [
    {
      id: 'heart',
      name: 'Coração',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['core'],
      levels: [
        { cost: { gold: 10 }, buildTime: 2, effect: 'h1' },
        { cost: { gold: 10 }, buildTime: 2, effect: 'h2' },
      ],
    },
    {
      id: 'forge',
      name: 'Forja',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['outer'],
      levels: [
        { cost: { gold: 20 }, buildTime: 3, effect: 'f1' },
        {
          cost: { gold: 30 },
          buildTime: 0,
          effect: 'f2',
          requires: [{ building: 'heart', minLevel: 1 }],
        },
      ],
    },
    {
      id: 'armory',
      name: 'Arsenal',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['outer'],
      requires: [{ building: 'forge', minLevel: 1 }],
      levels: [{ cost: { gold: 10, arcana: 5 }, buildTime: 1, effect: 'a1' }],
    },
  ],
  slots: {
    sizes: { core: 0.1, inner: 0.05, outer: 0.05 },
    slots: [
      { id: 'core', type: 'core', x: 0.5, y: 0.5 },
      { id: 'outer_n', type: 'outer', x: 0.5, y: 0.2 },
      { id: 'outer_s', type: 'outer', x: 0.5, y: 0.8 },
    ],
  },
  assets: { images: { i: 'icon.png', s: 'sprite.png' } },
});

export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    day: 1,
    resources: { gold: 100, arcana: 0 },
    slots: {},
    log: [],
    ...overrides,
  };
}
