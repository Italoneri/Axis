import { parseCatalog } from '../model/catalog';
import type { GameState } from '../model/schema';

const currencies = [
  { id: 'emerald', name: 'Esmeralda', icon: 'i', bronzeValue: 10000, order: 1 },
  { id: 'platinum', name: 'Platina', icon: 'i', bronzeValue: 1000, order: 2 },
  { id: 'gold', name: 'Ouro', icon: 'i', bronzeValue: 100, order: 3 },
  { id: 'silver', name: 'Prata', icon: 'i', bronzeValue: 10, order: 4 },
  { id: 'bronze', name: 'Bronze', icon: 'i', bronzeValue: 1, order: 5 },
];

const seed = {
  wallets: {
    camp: { gold: 100 },
    characters: [{ id: 'thorin', name: 'Thorin', color: '#aa5500', wallet: { gold: 5 } }],
  },
  materials: {
    categories: [{ id: 'ores', name: 'Minérios' }],
    items: [{ id: 'iron', name: 'Ferro', category: 'ores', quantity: 0 }],
  },
  research: { categories: [{ id: 'arcana', name: 'Arcana' }], entries: [] },
  influence: {
    total: 10,
    worlds: [{ id: 'valdren', name: 'Valdren', color: '#336699', influence: 30 }],
  },
};

/** Small catalog independent of the shipped balance numbers, so data tweaks never break tests. */
export const testCatalog = parseCatalog({
  currencies,
  buildings: [
    {
      id: 'heart',
      name: 'Coração',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['core'],
      levels: [
        { cost: { coins: 10 }, buildTime: 2, effect: 'h1' },
        { cost: { coins: 10 }, buildTime: 2, effect: 'h2' },
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
        { cost: { coins: 20 }, buildTime: 3, effect: 'f1' },
        {
          cost: { coins: 30 },
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
      levels: [{ cost: { coins: 10, materials: { iron: 5 } }, buildTime: 1, effect: 'a1' }],
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
  ...seed,
});

/** Same content as `createInitialState(testCatalog)`, built by hand so tests can override parts. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: 2,
    day: 1,
    characters: [{ id: 'thorin', name: 'Thorin', color: '#aa5500' }],
    wallets: { camp: { gold: 100 }, characters: { thorin: { gold: 5 } } },
    materials: seed.materials,
    research: seed.research,
    influence: seed.influence,
    slots: {},
    log: [],
    ...overrides,
  };
}

/** Shortcut for a state whose Acampamento holds the given coins. */
export function withCamp(camp: Record<string, number>, overrides: Partial<GameState> = {}) {
  const base = makeState(overrides);
  return { ...base, wallets: { ...base.wallets, camp } };
}

export function withIron(quantity: number, overrides: Partial<GameState> = {}): GameState {
  const base = makeState(overrides);
  return {
    ...base,
    materials: {
      ...base.materials,
      items: base.materials.items.map((m) => (m.id === 'iron' ? { ...m, quantity } : m)),
    },
  };
}
