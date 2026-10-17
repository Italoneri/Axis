import { parseCatalog } from '../model/catalog';
import {
  SAVE_VERSION,
  type GameState,
  type Mission,
  type Npc,
  type ShopItem,
} from '../model/schema';

const currencies = [
  { id: 'emerald', name: 'Esmeralda', icon: 'i', bronzeValue: 10000, order: 1 },
  { id: 'platinum', name: 'Platina', icon: 'i', bronzeValue: 1000, order: 2 },
  { id: 'gold', name: 'Ouro', icon: 'i', bronzeValue: 100, order: 3 },
  { id: 'silver', name: 'Prata', icon: 'i', bronzeValue: 10, order: 4 },
  { id: 'bronze', name: 'Bronze', icon: 'i', bronzeValue: 1, order: 5 },
];

function outerSlot(id: string, startAngle: number) {
  const arc = { innerRadius: 0.358, outerRadius: 0.44, startAngle, endAngle: startAngle + 17 };
  return { id, type: 'outer', shape: 'arc', x: 0.5, y: 0.1, angle: startAngle + 8.5, arc };
}

function shopMaterial(id: string, materialId: string, price: Record<string, number>): ShopItem {
  return {
    id,
    kind: 'material',
    materialId,
    price,
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
  };
}

const seed = {
  wallets: {
    camp: { gold: 100 },
    characters: [{ id: 'thorin', name: 'Thorin', color: '#aa5500', wallet: { gold: 5 } }],
  },
  materials: {
    categories: [{ id: 'ores', name: 'Minérios' }],
    items: [
      { id: 'iron', name: 'Ferro', category: 'ores', quantity: 0 },
      { id: 'wood', name: 'Madeira', category: 'ores', quantity: 0 },
      { id: 'aetherium', name: 'Aetherium', category: 'ores', quantity: 0 },
    ],
  },
  research: { categories: [{ id: 'arcana', name: 'Arcana' }], entries: [] },
  shop: {
    items: [
      shopMaterial('shop_wood', 'wood', { bronze: 3 }),
      shopMaterial('shop_iron', 'iron', { silver: 1 }),
      shopMaterial('shop_aetherium', 'aetherium', { silver: 5 }),
    ],
  },
};

const influence = {
  worlds: [
    { id: 'human', name: 'Mundo Humano', color: '#d9b26a' },
    { id: 'draconic', name: 'Terras Dracônicas', color: '#c0392b' },
  ],
};

function forging(perDay: number) {
  const effect = { type: 'produce', material: 'iron', perDay };
  return { activity: 'forjar', name: 'Forjar', skill: 'smithing', effect };
}

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
        {
          cost: { coins: 10 },
          buildTime: 2,
          party: 'h1',
          axis: '',
          jobs: [
            {
              activity: 'estudar',
              name: 'Estudar',
              skill: 'research',
              effect: { type: 'research', perDay: 2 },
            },
          ],
        },
        {
          cost: { coins: 10 },
          buildTime: 2,
          party: 'h2',
          axis: 'h2 axis',
          jobs: [
            {
              activity: 'rezar',
              name: 'Rezar',
              skill: 'research',
              effect: { type: 'bonus', text: 'bênção' },
            },
          ],
        },
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
        { cost: { coins: 20 }, buildTime: 3, party: 'f1', axis: 'f1 axis', jobs: [forging(1)] },
        {
          cost: { coins: 30 },
          buildTime: 0,
          party: '',
          axis: '',
          requires: [{ building: 'heart', minLevel: 1 }],
          jobs: [forging(2)],
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
      levels: [
        { cost: { coins: 10, materials: { iron: 5 } }, buildTime: 1, party: 'a1', axis: '' },
      ],
    },
    {
      id: 'barracks',
      name: 'Alojamento',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['outer'],
      levels: [
        { cost: { coins: 10 }, buildTime: 2, party: 'b1', axis: '', housing: { capacity: 2 } },
        { cost: { coins: 10 }, buildTime: 2, party: 'b2', axis: '', housing: { capacity: 3 } },
      ],
    },
    {
      id: 'guild',
      name: 'Guilda',
      description: '',
      icon: 'i',
      sprite: 's',
      allowedSlots: ['outer'],
      levels: [
        { cost: { coins: 10 }, buildTime: 1, party: 'g1', axis: '' },
        { cost: { coins: 10 }, buildTime: 1, party: 'g2', axis: '' },
      ],
    },
  ],
  layout: {
    version: 3,
    wall: { outerRadius: 0.476, thickness: 0.032 },
    entrances: {
      width: 0.046,
      angles: [0],
      prisms: [{ id: 'roxo', name: 'Roxo', rgb: [128, 52, 200] }],
    },
    innerDisc: { radius: 0.214 },
    core: { radius: 0.092 },
    slots: [
      { id: 'core', type: 'core', shape: 'round', x: 0.5, y: 0.5, angle: 0, size: 0.184 },
      outerSlot('outer_n', 340),
      outerSlot('outer_s', 170),
      outerSlot('outer_e', 80),
      outerSlot('outer_w', 260),
    ],
  },
  assets: { images: { i: 'icon.png', s: 'sprite.png' } },
  influence,
  skills: {
    skills: [
      { id: 'construction', name: 'Construção', icon: 'c', description: '' },
      { id: 'smithing', name: 'Ferraria', icon: 's', description: '' },
      { id: 'research', name: 'Pesquisa', icon: 'r', description: '' },
    ],
  },
  attributes: {
    attributes: [
      { id: 'strength', name: 'Força', icon: 'f', description: '' },
      { id: 'dexterity', name: 'Destreza', icon: 'd', description: '' },
      { id: 'magic', name: 'Poder Mágico', icon: 'm', description: '' },
    ],
  },
  npcs: {
    negativeDivisor: 5,
    skillTenthsAbove10: { 11: 26, 12: 35, 13: 46, 14: 61, 15: 80 },
    housingBuildings: ['barracks'],
    postSlots: { core: [1, 1], outer: [1, 2] },
    construction: {
      activity: 'construir',
      name: 'Construir',
      skill: 'construction',
      slots: 2,
      effect: { type: 'construction', perDay: 1 },
    },
  },
  missions: {
    campCommissionPercent: 20,
    guildBonus: { building: 'guild', minLevel: 2, percent: 10 },
    attributePointsAbove10: {
      11: 13,
      12: 17,
      13: 23,
      14: 30,
      15: 40,
      16: 53,
      17: 70,
      18: 92,
      19: 121,
      20: 160,
    },
    teamSpeed: { k: 160, m: 3, minDays: 1, maxSlowdown: 2 },
  },
  ...seed,
});

/** Same content as `createInitialState(testCatalog)`, built by hand so tests can override parts. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    version: SAVE_VERSION,
    revision: 0,
    day: 1,
    characters: [{ id: 'thorin', name: 'Thorin', color: '#aa5500' }],
    wallets: { camp: { gold: 100 }, characters: { thorin: { gold: 5 } } },
    materials: seed.materials,
    research: seed.research,
    influence: { human: 0, draconic: 0 },
    npcs: [],
    missions: [],
    shop: seed.shop,
    slots: {},
    log: [],
    ...overrides,
  };
}

/** An NPC with every optional part empty, for tests to override. */
export function npc(overrides: Partial<Npc> & Pick<Npc, 'id' | 'name'>): Npc {
  return {
    title: '',
    description: '',
    skills: {},
    home: null,
    job: null,
    status: 'disponivel',
    ...overrides,
  };
}

/** An open mission worth 2 gold, for tests to override. */
export function mission(overrides: Partial<Mission> & Pick<Mission, 'id'>): Mission {
  return {
    title: 'Contrato',
    requester: '',
    location: '',
    description: '',
    reward: { gold: 2 },
    days: 3,
    difficulty: 'facil',
    createdOnDay: 1,
    progress: { status: 'aberta' },
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

/** localStorage stand-in for tests of the persistence layer. */
export function memoryStorage(initial: Record<string, string> = {}): Storage {
  const items = new Map(Object.entries(initial));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}
