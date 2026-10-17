import { describe, expect, it } from 'vitest';
import { HERB_GARDEN_BUILDING_ID } from '../model/catalog';
import { gameStateSchema, type GameState } from '../model/schema';
import { LOG_LIMIT } from '../systems/outcome';
import {
  herbGardenCatalog,
  makeState,
  mission,
  npc,
  testCatalog,
  withIron,
} from '../systems/testFixtures';
import { applyCommand } from './applyCommand';
import { newId } from './newId';
import type { CommandContext, CommandType, GameCommand } from './schema';

const master: CommandContext = { actor: { role: 'master' } };
const thorinPlayer: CommandContext = { actor: { role: 'player', characterId: 'thorin' } };

/** Base with something in every collection, so update/remove commands have targets. */
function richState(): GameState {
  const base = withIron(10, { day: 3 });
  return {
    ...base,
    garden: {
      crops: [
        {
          seedId: 'iron',
          harvestId: 'wood',
          plotType: 'muda',
          days: 2,
          yield: 1,
          rare: true,
        },
      ],
      plots: {},
    },
    slots: {
      core: { buildingId: 'heart', level: 1, status: 'done' },
      outer_n: { buildingId: 'forge', level: 1, status: 'done' },
      outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
      post: { buildingId: 'trading_post', level: 3, status: 'done' },
    },
    npcs: [
      npc({
        id: 'bianca',
        name: 'Bianca',
        skills: { research: 4 },
        home: 'outer_e',
        job: { slotId: 'outer_n', activityId: 'forjar', carry: 0 },
        status: 'trabalhando',
      }),
      npc({ id: 'tomas', name: 'Tomás' }),
    ],
    research: {
      ...base.research,
      categories: [...base.research.categories, { id: 'empty', name: 'Vazia' }],
      entries: [
        {
          id: 'runes',
          title: 'Runas',
          category: 'arcana',
          description: '',
          notes: '',
          status: 'em_andamento',
          progress: 10,
        },
      ],
    },
    materials: {
      ...base.materials,
      categories: [...base.materials.categories, { id: 'gems', name: 'Gemas' }],
    },
    missions: [
      mission({ id: 'contrato', title: 'Contrato' }),
      mission({ id: 'escolta', title: 'Escolta', progress: { status: 'grupo', startedOnDay: 2 } }),
    ],
  };
}

const thorin = { kind: 'character', characterId: 'thorin' } as const;
const draft = {
  title: 'Alquimia',
  category: 'arcana',
  description: '',
  notes: '',
  status: 'em_andamento',
  progress: 0,
} as const;

const shopEquipment = {
  kind: 'equipment',
  name: 'Espada longa',
  description: '',
  depotKind: 'equipamento',
  price: { silver: 8 },
  stock: 2,
  minLevel: 2,
  featured: false,
  hidden: false,
} as const;

const missionFields = {
  title: 'Caçada',
  requester: 'Rizzelena',
  location: 'Forja',
  description: 'Uma *guivra* no rio.',
  reward: { gold: 2 },
  days: 3,
  difficulty: 'media',
} as const;

const npcFields = {
  name: 'Bianca',
  title: 'Maga',
  description: '',
  skills: { research: 7 },
  attributes: { strength: 7, dexterity: 7, magic: 6 },
  wage: 0.5,
};

/** One valid command per type: the record forces a new command type to get a case here. */
const validCommands: Record<CommandType, GameCommand> = {
  build: { type: 'build', slotId: 'outer_s', buildingId: 'armory' },
  upgrade: { type: 'upgrade', slotId: 'core' },
  advance_days: { type: 'advance_days', days: 2 },
  force_building: { type: 'force_building', slotId: 'outer_s', buildingId: 'armory', level: 1 },
  remove_building: { type: 'remove_building', slotId: 'outer_n' },
  adjust_coins: {
    type: 'adjust_coins',
    wallet: { kind: 'camp' },
    delta: { gold: -10, silver: -3 },
  },
  give_coins: { type: 'give_coins', wallet: { kind: 'camp' }, coins: { gold: 2 } },
  take_coins: { type: 'take_coins', wallet: { kind: 'camp' }, coins: { gold: 5, silver: 50 } },
  deposit: { type: 'deposit', characterId: 'thorin', coins: { gold: 2 } },
  transfer_coins: {
    type: 'transfer_coins',
    from: { kind: 'camp' },
    to: thorin,
    coins: { gold: 7 },
  },
  consolidate_wallet: { type: 'consolidate_wallet', wallet: { kind: 'camp' } },
  add_material: { type: 'add_material', id: 'mat_1', name: 'Prata', category: 'ores', quantity: 4 },
  update_material: { type: 'update_material', materialId: 'iron', name: 'Aço', category: 'gems' },
  remove_material: { type: 'remove_material', materialId: 'iron' },
  adjust_material: { type: 'adjust_material', materialId: 'iron', delta: -3 },
  add_material_category: { type: 'add_material_category', id: 'matcat_1', name: 'Madeiras' },
  rename_material_category: {
    type: 'rename_material_category',
    categoryId: 'ores',
    name: 'Metais',
  },
  remove_material_category: { type: 'remove_material_category', categoryId: 'gems' },
  add_research: { type: 'add_research', id: 'res_1', draft },
  update_research: {
    type: 'update_research',
    researchId: 'runes',
    draft: { ...draft, progress: 50 },
  },
  complete_research: { type: 'complete_research', researchId: 'runes' },
  remove_research: { type: 'remove_research', researchId: 'runes' },
  add_research_category: { type: 'add_research_category', id: 'rescat_1', name: 'Forja' },
  rename_research_category: {
    type: 'rename_research_category',
    categoryId: 'arcana',
    name: 'Magia',
  },
  remove_research_category: { type: 'remove_research_category', categoryId: 'empty' },
  set_influence: { type: 'set_influence', worldId: 'human', value: 40 },
  add_character: { type: 'add_character', id: 'char_1', name: 'Lyra', color: '#3366cc' },
  update_character: {
    type: 'update_character',
    characterId: 'thorin',
    name: 'Thorin II',
    color: '#112233',
  },
  remove_character: { type: 'remove_character', characterId: 'thorin' },
  character_join: { type: 'character_join', id: 'char_new', name: 'Lyra', color: '#6a8fd4' },
  character_claim: { type: 'character_claim', characterId: 'thorin' },
  character_release: { type: 'character_release', characterId: 'thorin' },
  npc_create: { type: 'npc_create', id: 'npc_1', ...npcFields, name: 'Lia' },
  npc_update: { type: 'npc_update', npcId: 'bianca', ...npcFields, status: 'ferido' },
  npc_remove: { type: 'npc_remove', npcId: 'bianca' },
  npc_set_home: { type: 'npc_set_home', npcId: 'tomas', slotId: 'outer_e' },
  npc_assign_job: {
    type: 'npc_assign_job',
    npcId: 'bianca',
    slotId: 'core',
    activityId: 'estudar',
    researchId: 'runes',
  },
  npc_unassign: { type: 'npc_unassign', npcId: 'bianca' },
  archive_log: {
    type: 'archive_log',
    change: { target: 'topic', action: 'created', title: 'Pets' },
  },
  depot_log: {
    type: 'depot_log',
    change: { target: 'item', action: 'created', title: 'Poção de cura', quantity: 3 },
  },
  set_image: {
    type: 'set_image',
    target: { kind: 'character', id: 'thorin' },
    image: 'upload:character/thorin/img_1.webp',
  },
  shop_item_create: { type: 'shop_item_create', id: 'shop_sword', item: shopEquipment },
  shop_item_update: { type: 'shop_item_update', itemId: 'shop_wood', item: shopEquipment },
  shop_item_remove: { type: 'shop_item_remove', itemId: 'shop_iron' },
  garden_crop_create: {
    type: 'garden_crop_create',
    crop: {
      seedId: 'wood',
      harvestId: 'iron',
      plotType: 'canteiro',
      days: 3,
      yield: 2,
      rare: false,
      price: { gold: 1 },
    },
  },
  garden_crop_update: {
    type: 'garden_crop_update',
    seedId: 'iron',
    crop: { harvestId: 'wood', plotType: 'canteiro', days: 3, yield: 2, rare: true },
  },
  garden_crop_remove: { type: 'garden_crop_remove', seedId: 'iron' },
  garden_plant: { type: 'garden_plant', plotId: 'canteiro-1', seedId: 'semente', buy: false },
  garden_harvest: { type: 'garden_harvest', plotId: 'canteiro-2' },
  garden_clear: { type: 'garden_clear', plotId: 'canteiro-2' },
  shop_set_promotion: { type: 'shop_set_promotion', itemId: 'shop_wood', discountPercent: 20 },
  shop_buy: {
    type: 'shop_buy',
    itemId: 'shop_wood',
    quantity: 2,
    payer: { kind: 'camp' },
    deliveryId: 'delivery_1',
  },
  shop_buy_materials: {
    type: 'shop_buy_materials',
    lines: [{ itemId: 'shop_wood', quantity: 2 }],
  },
  shop_sell: { type: 'shop_sell', materialId: 'iron', quantity: 4 },
  mission_create: { type: 'mission_create', id: 'mission_1', ...missionFields },
  mission_update: { type: 'mission_update', missionId: 'contrato', ...missionFields },
  mission_remove: { type: 'mission_remove', missionId: 'contrato' },
  mission_take_party: { type: 'mission_take_party', missionId: 'contrato' },
  mission_send_npcs: { type: 'mission_send_npcs', missionId: 'contrato', npcIds: ['tomas'] },
  mission_resolve: {
    type: 'mission_resolve',
    missionId: 'escolta',
    result: 'sucesso',
    injuredNpcIds: [],
  },
};

function run(command: unknown, ctx: CommandContext = master, state = richState()) {
  return applyCommand(state, testCatalog, command, ctx);
}

const gardenWork = new Set<CommandType>(['garden_plant', 'garden_harvest', 'garden_clear']);

/** An estufa nv1, two seeds in stock and a ready mint on `canteiro-2`; the rest of the camp as `richState`. */
function gardenWorkState(): GameState {
  const base = richState();
  const material = (id: string, quantity: number) => ({
    id,
    name: id,
    category: 'ores',
    quantity,
  });
  return {
    ...base,
    slots: {
      ...base.slots,
      outer_w: { buildingId: HERB_GARDEN_BUILDING_ID, level: 1, status: 'done' },
    },
    materials: {
      ...base.materials,
      items: [...base.materials.items, material('semente', 2), material('menta', 0)],
    },
    garden: {
      crops: [
        {
          seedId: 'semente',
          harvestId: 'menta',
          plotType: 'canteiro',
          days: 3,
          yield: 4,
          rare: false,
          price: { bronze: 2 },
        },
      ],
      plots: { 'canteiro-2': { seedId: 'semente', growthTenths: 30 } },
    },
  };
}

function runGarden(command: unknown, ctx: CommandContext, state = gardenWorkState()) {
  return applyCommand(state, herbGardenCatalog, command, ctx);
}

/** How the game function links and unlinks players. */
const joining: CommandContext = {
  actor: { role: 'player', characterId: 'char_new' },
  membership: true,
};
const membershipCommands = new Set<CommandType>([
  'character_join',
  'character_claim',
  'character_release',
]);

describe('applyCommand', () => {
  it.each(Object.values(validCommands))(
    'applies $type into a state that passes the schema',
    (command) => {
      // remove_character needs an empty wallet; everything else runs on the rich state.
      const state =
        command.type === 'remove_character'
          ? { ...richState(), wallets: { camp: { gold: 100 }, characters: { thorin: {} } } }
          : richState();
      const ctx = membershipCommands.has(command.type) ? joining : master;
      const result = gardenWork.has(command.type)
        ? runGarden(command, ctx)
        : run(command, ctx, state);
      if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
      expect(result.state).not.toBe(state);
      expect(gameStateSchema.safeParse(result.state).success).toBe(true);
    },
  );

  it('playerCanPlantHarvestAndClear', () => {
    const planted = runGarden(validCommands.garden_plant, thorinPlayer);
    if (!planted.ok) throw new Error(planted.error);
    expect(planted.state.garden.plots['canteiro-1']).toEqual({
      seedId: 'semente',
      growthTenths: 0,
    });

    const harvested = runGarden({ type: 'garden_harvest' }, thorinPlayer, planted.state);
    if (!harvested.ok) throw new Error(harvested.error);
    expect(harvested.state.materials.items.find((m) => m.id === 'menta')?.quantity).toBe(4);
    expect(harvested.logged).toMatchObject([
      { kind: 'garden_harvested', material: 'menta', quantity: 4, actor: 'Thorin' },
    ]);

    const cleared = runGarden(validCommands.garden_clear, thorinPlayer, harvested.state);
    if (!cleared.ok) throw new Error(cleared.error);
    expect(cleared.state.garden.plots['canteiro-2']).toBeUndefined();
  });

  it.each([
    { name: 'non-object', input: 'build' },
    { name: 'unknown type', input: { type: 'cheat' } },
    { name: 'missing field', input: { type: 'build', slotId: 'core' } },
    { name: 'fractional days', input: { type: 'advance_days', days: 1.5 } },
    {
      name: 'negative deposit',
      input: { type: 'deposit', characterId: 'thorin', coins: { gold: -1 } },
    },
    { name: 'bad color', input: { type: 'add_character', id: 'c', name: 'X', color: 'red' } },
    { name: 'missing id', input: { type: 'add_character', name: 'X', color: '#123456' } },
    { name: 'unsafe id', input: { type: 'add_material_category', id: 'Ferro Bom!', name: 'X' } },
    {
      name: 'skill below -10',
      input: {
        type: 'npc_create',
        id: 'npc_x',
        ...npcFields,
        name: 'X',
        skills: { smithing: -11 },
      },
    },
    {
      name: 'an old-format adjustment that adds and removes at once',
      input: { type: 'adjust_coins', wallet: { kind: 'camp' }, delta: { gold: -5, silver: 3 } },
    },
    {
      name: 'attribute below -10',
      input: { type: 'npc_create', id: 'npc_x', ...npcFields, attributes: { strength: -11 } },
    },
    {
      name: 'attribute above 20',
      input: {
        type: 'npc_update',
        npcId: 'bianca',
        ...npcFields,
        status: 'disponivel',
        attributes: { magic: 21 },
      },
    },
    {
      name: 'unknown attribute',
      input: { type: 'npc_create', id: 'npc_x', ...npcFields, attributes: { charisma: 5 } },
    },
    {
      name: 'sprite with a path',
      input: { type: 'npc_create', id: 'npc_x', ...npcFields, sprite: '../aventureira' },
    },
    {
      name: 'empty sprite',
      input: {
        type: 'npc_update',
        npcId: 'bianca',
        ...npcFields,
        status: 'disponivel',
        sprite: '',
      },
    },
    {
      name: 'skill above 15',
      input: {
        type: 'npc_update',
        npcId: 'bianca',
        ...npcFields,
        status: 'disponivel',
        skills: { smithing: 16 },
      },
    },
  ])('refuses a malformed command: $name', ({ input }) => {
    expect(run(input)).toEqual({ ok: false, error: 'invalid_command' });
  });

  it.each([
    { name: 'unknown slot', command: { type: 'build', slotId: 'nowhere', buildingId: 'forge' } },
    { name: 'empty slot upgrade', command: { type: 'upgrade', slotId: 'outer_s' } },
    {
      name: 'unknown building',
      command: { type: 'force_building', slotId: 'core', buildingId: 'x', level: 1 },
    },
    { name: 'empty slot removal', command: { type: 'remove_building', slotId: 'outer_s' } },
  ])('reports $name as not_found instead of throwing', ({ command }) => {
    expect(run(command)).toEqual({ ok: false, error: 'not_found' });
  });

  it('refuses a level the building does not have', () => {
    const command = { type: 'force_building', slotId: 'core', buildingId: 'heart', level: 9 };
    expect(run(command)).toEqual({ ok: false, error: 'invalid_command' });
  });

  it('explains a blocked construction', () => {
    const result = run({ type: 'build', slotId: 'core', buildingId: 'forge' });
    expect(result).toMatchObject({ ok: false, error: 'blocked' });
    if (result.ok) return;
    expect(result.reasons?.map((r) => r.kind)).toContain('wrong_slot_type');
  });

  it('passes system refusals through', () => {
    const command = { type: 'deposit', characterId: 'thorin', coins: { gold: 99 } };
    expect(run(command)).toEqual({ ok: false, error: 'insufficient_coins' });
  });

  it('reports the change views animate', () => {
    const building = {
      ...richState(),
      slots: {
        outer_n: {
          buildingId: 'forge',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 4,
        },
      },
    } satisfies GameState;
    expect(run(validCommands.advance_days, master, building)).toMatchObject({
      ok: true,
      change: { kind: 'days_advanced', completedSlotIds: ['outer_n'] },
    });
    expect(run(validCommands.build)).toMatchObject({
      change: { kind: 'construction_started', slotId: 'outer_s' },
    });
  });

  it.each([
    { name: 'without a sprite', sprite: {}, stored: undefined },
    { name: 'with a sprite', sprite: { sprite: 'aventureira_civil' }, stored: 'aventureira_civil' },
    { name: 'hidden from the map', sprite: { sprite: 'none' }, stored: 'none' },
    { name: 'back to automatic', sprite: { sprite: null }, stored: undefined },
  ])('creates and edits an NPC $name', ({ sprite, stored }) => {
    const created = run({ ...validCommands.npc_create, ...sprite });
    if (!created.ok) throw new Error(created.error);
    expect(created.state.npcs.find((n) => n.id === 'npc_1')?.sprite).toBe(stored);
    const edited = run({ ...validCommands.npc_update, ...sprite });
    if (!edited.ok) throw new Error(edited.error);
    expect(edited.state.npcs.find((n) => n.id === 'bianca')?.sprite).toBe(stored);
  });
});

describe('applyCommand permissions', () => {
  const playerCommands = new Set<CommandType>([
    'build',
    'upgrade',
    'deposit',
    'npc_set_home',
    'npc_assign_job',
    'npc_unassign',
    'archive_log',
    'depot_log',
    'mission_create',
    'mission_update',
    'mission_remove',
    'mission_take_party',
    'mission_send_npcs',
    'set_image',
    'shop_buy',
    'shop_buy_materials',
    'shop_sell',
    'garden_plant',
    'garden_harvest',
    'garden_clear',
  ]);
  const masterOnly = Object.values(validCommands).filter(
    (c) => !playerCommands.has(c.type) && !membershipCommands.has(c.type),
  );
  const membership = Object.values(validCommands).filter((c) => membershipCommands.has(c.type));

  it.each(masterOnly)('refuses $type from a player', (command) => {
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it.each([...playerCommands].map((type) => validCommands[type]))(
    'lets a player run $type',
    (command) => {
      const result = gardenWork.has(command.type)
        ? runGarden(command, thorinPlayer)
        : run(command, thorinPlayer);
      expect(result.ok).toBe(true);
    },
  );

  it.each(membership)('refuses $type sent as a plain command, even by the master', (command) => {
    expect(run(command, master)).toEqual({ ok: false, error: 'forbidden' });
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refuses a home where the slot offers no housing', () => {
    const command = { type: 'npc_set_home', npcId: 'tomas', slotId: 'outer_n' };
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'no_housing' });
  });

  it('lets a player deposit only from their own character', () => {
    const otherPlayer: CommandContext = { actor: { role: 'player', characterId: 'lyra' } };
    const anonymous: CommandContext = { actor: { role: 'player' } };
    expect(run(validCommands.deposit, otherPlayer)).toEqual({ ok: false, error: 'forbidden' });
    expect(run(validCommands.deposit, anonymous)).toEqual({ ok: false, error: 'forbidden' });
  });

  it.each([
    { name: 'another character', kind: 'character', id: 'lyra' },
    { name: 'an NPC', kind: 'npc', id: 'bianca' },
    { name: 'a material', kind: 'material', id: 'iron' },
    { name: 'a world', kind: 'world', id: 'human' },
  ] as const)('refuses a player the photo of $name', ({ kind, id }) => {
    const command = {
      type: 'set_image',
      target: { kind, id },
      image: `upload:${kind}/${id}/img_1.webp`,
    };
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it.each([
    validCommands.shop_item_create,
    validCommands.shop_item_update,
    validCommands.shop_item_remove,
    validCommands.shop_set_promotion,
    { type: 'set_image', target: { kind: 'shop_item', id: 'shop_wood' } },
  ])('refusesShopEditsFromPlayers: $type', (command) => {
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it.each([
    validCommands.garden_crop_create,
    validCommands.garden_crop_update,
    validCommands.garden_crop_remove,
  ])('refusesCropEditsFromPlayers: $type', (command) => {
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('refusesPayingFromAnotherCharacter', () => {
    const command = {
      ...validCommands.shop_buy,
      payer: { kind: 'character', characterId: 'lyra' },
    };
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('allowsPlayerToPayFromCamp', () => {
    const result = run(validCommands.shop_buy, thorinPlayer);
    if (!result.ok) throw new Error(result.error);
    expect(result.change).toEqual({ kind: 'shop_purchased', delivery: null });
    expect(result.logged).toMatchObject([{ kind: 'shop_purchased', actor: 'Thorin', bronze: 6 }]);
  });

  it('buysMissingMaterialsForAPlayer', () => {
    const result = run(validCommands.shop_buy_materials, thorinPlayer);
    if (!result.ok) throw new Error(result.error);
    expect(result.change).toEqual({ kind: 'resources_changed' });
    expect(result.logged).toMatchObject([{ kind: 'shop_purchased', actor: 'Thorin', bronze: 6 }]);
  });

  it.each([
    { lines: [] },
    { lines: Array.from({ length: 21 }, () => ({ itemId: 'shop_wood', quantity: 1 })) },
  ])('rejectsBadMaterialLines', (fields) => {
    const command = { ...validCommands.shop_buy_materials, ...fields };
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'invalid_command' });
  });

  it('refusesSellingBelowLevel3', () => {
    const state = richState();
    const post = { buildingId: 'trading_post', level: 1, status: 'done' } as const;
    const level1 = { ...state, slots: { ...state.slots, post } };
    expect(run(validCommands.shop_sell, thorinPlayer, level1)).toEqual({
      ok: false,
      error: 'not_for_sale',
    });
  });

  it('lets a player clear the photo of their own character', () => {
    const command = { type: 'set_image', target: { kind: 'character', id: 'thorin' } };
    expect(run(command, thorinPlayer).ok).toBe(true);
  });

  it('checks permission before touching the state', () => {
    const state = makeState();
    const result = applyCommand(state, testCatalog, validCommands.advance_days, thorinPlayer);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });
});

describe('applyCommand membership', () => {
  it('creates the joining character with an empty wallet and logs the arrival', () => {
    const result = run(validCommands.character_join, joining);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.characters.at(-1)).toMatchObject({ id: 'char_new', name: 'Lyra' });
    expect(result.state.wallets.characters['char_new']).toEqual({});
    expect(result.logged).toMatchObject([{ kind: 'character_joined', name: 'Lyra' }]);
  });

  it('refuses a new character with the name of one already at the table', () => {
    const command = { ...validCommands.character_join, name: 'Thorin' };
    expect(run(command, joining)).toEqual({ ok: false, error: 'duplicate_name' });
  });

  it.each([
    { type: 'character_claim', kind: 'character_claimed' },
    { type: 'character_release', kind: 'character_released' },
  ] as const)('logs $type without touching the character', ({ type, kind }) => {
    const state = richState();
    const result = run({ type, characterId: 'thorin' }, joining, state);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.characters).toEqual(state.characters);
    expect(result.logged).toMatchObject([{ kind, name: 'Thorin' }]);
  });

  it('refuses to claim a character that does not exist', () => {
    const command = { type: 'character_claim', characterId: 'ghost' };
    expect(run(command, joining)).toEqual({ ok: false, error: 'not_found' });
  });
});

describe('applyCommand set_image', () => {
  const setImage = (
    kind: 'character' | 'npc' | 'material' | 'world' | 'shop_item',
    id: string,
    image?: string,
  ) =>
    ({
      type: 'set_image',
      target: { kind, id },
      ...(image === undefined ? {} : { image }),
    }) as const;

  it.each([
    { kind: 'npc', id: 'bianca', read: (s: GameState) => s.npcs[0]?.portrait },
    { kind: 'material', id: 'iron', read: (s: GameState) => s.materials.items[0]?.icon },
    { kind: 'world', id: 'human', read: (s: GameState) => s.worldIcons?.human },
    { kind: 'character', id: 'thorin', read: (s: GameState) => s.characters[0]?.portrait },
    { kind: 'shop_item', id: 'shop_wood', read: (s: GameState) => s.shop.items[0]?.image },
  ] as const)('lets the master set and clear the photo of a $kind', ({ kind, id, read }) => {
    const image = `upload:${kind}/${id}/img_1.webp`;
    const set = run(setImage(kind, id, image));
    if (!set.ok) throw new Error(set.error);
    expect(read(set.state)).toBe(image);
    expect(gameStateSchema.safeParse(set.state).success).toBe(true);

    const cleared = run(setImage(kind, id), master, set.state);
    if (!cleared.ok) throw new Error(cleared.error);
    expect(read(cleared.state)).toBeUndefined();
  });

  it('keeps asset keys and URLs working', () => {
    const result = run(setImage('npc', 'bianca', 'https://example.com/bianca.png'));
    expect(result.ok && result.state.npcs[0]?.portrait).toBe('https://example.com/bianca.png');
  });

  it.each([
    { name: 'of another record', image: 'upload:character/lyra/img_1.webp' },
    { name: 'of another kind', image: 'upload:npc/thorin/img_1.webp' },
    { name: 'malformed', image: 'upload:character/thorin/../x.webp' },
  ])('refuses an upload $name', ({ image }) => {
    expect(run(setImage('character', 'thorin', image), thorinPlayer)).toEqual({
      ok: false,
      error: 'invalid_command',
    });
  });

  it('reports an unknown record as not_found', () => {
    expect(run(setImage('npc', 'ghost'))).toEqual({ ok: false, error: 'not_found' });
  });

  it('keeps the same state when the photo does not change', () => {
    const state = richState();
    const result = run(setImage('npc', 'tomas'), master, state);
    expect(result.ok && result.state).toBe(state);
  });
});

describe('applyCommand log', () => {
  it.each([
    { name: 'the master', ctx: master, actor: 'Mestre' },
    { name: 'a player', ctx: thorinPlayer, actor: 'Thorin' },
  ])('records $name as the actor of every new entry', ({ ctx, actor }) => {
    const result = run(validCommands.deposit, ctx);
    if (!result.ok) throw new Error(result.error);
    expect(result.logged).toEqual([
      { day: 3, kind: 'coins_deposited', actor, character: 'Thorin', coins: { gold: 2 } },
    ]);
    expect(result.state.log.at(-1)).toEqual(result.logged[0]);
  });

  it('logs a depot change with its actor', () => {
    const result = run(validCommands.depot_log, thorinPlayer);
    if (!result.ok) throw new Error(result.error);
    expect(result.logged).toEqual([
      {
        day: 3,
        kind: 'depot_changed',
        actor: 'Thorin',
        change: { target: 'item', action: 'created', title: 'Poção de cura', quantity: 3 },
      },
    ]);
  });

  it('logs an archive change with its actor', () => {
    const result = run(validCommands.archive_log, thorinPlayer);
    if (!result.ok) throw new Error(result.error);
    expect(result.logged).toEqual([
      {
        day: 3,
        kind: 'archive_changed',
        actor: 'Thorin',
        change: { target: 'topic', action: 'created', title: 'Pets' },
      },
    ]);
  });

  it('leaves an anonymous player out of the entry', () => {
    const anonymous: CommandContext = { actor: { role: 'player' } };
    const result = run(validCommands.build, anonymous);
    if (!result.ok) throw new Error(result.error);
    expect(result.logged[0]).not.toHaveProperty('actor');
  });

  it('keeps only the latest LOG_LIMIT entries', () => {
    const old = Array.from({ length: LOG_LIMIT }, (_, i) => ({
      day: 1,
      kind: 'days_advanced' as const,
      days: i + 1,
    }));
    const result = run(validCommands.advance_days, master, { ...richState(), npcs: [], log: old });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.log).toHaveLength(LOG_LIMIT);
    expect(result.state.log[0]).toEqual(old[1]);
    expect(result.state.log.at(-1)).toMatchObject({
      kind: 'days_advanced',
      days: 2,
      actor: 'Mestre',
    });
  });

  it('bumps the revision only when something changed', () => {
    const state = { ...richState(), revision: 7 };
    const changed = applyCommand(state, testCatalog, validCommands.advance_days, master);
    const noop = applyCommand(
      state,
      testCatalog,
      { type: 'set_influence', worldId: 'human', value: 0 },
      master,
    );
    expect(changed).toMatchObject({ ok: true, state: { revision: 8 } });
    expect(noop).toMatchObject({ ok: true, state: { revision: 7 }, logged: [] });
  });
});

describe('newId', () => {
  it('makes distinct ids that the commands accept', () => {
    const ids = Array.from({ length: 50 }, () => newId('mat'));
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^mat_[0-9a-f]{16}$/));
    const command = { type: 'add_material_category', id: ids[0], name: 'Cristais' };
    expect(run(command).ok).toBe(true);
  });

  it('refuses to create a record twice with the same id', () => {
    const command = { type: 'add_material_category', id: 'ores', name: 'Outra' };
    expect(run(command)).toEqual({ ok: false, error: 'duplicate_id' });
  });
});
