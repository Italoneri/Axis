import { describe, expect, it } from 'vitest';
import { gameStateSchema, type GameState } from '../model/schema';
import { LOG_LIMIT } from '../systems/outcome';
import { makeState, mission, npc, testCatalog, withIron } from '../systems/testFixtures';
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
    slots: {
      core: { buildingId: 'heart', level: 1, status: 'done' },
      outer_n: { buildingId: 'forge', level: 1, status: 'done' },
      outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
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
  wage: 0.5,
};

/** One valid command per type: the record forces a new command type to get a case here. */
const validCommands: Record<CommandType, GameCommand> = {
  build: { type: 'build', slotId: 'outer_s', buildingId: 'armory' },
  upgrade: { type: 'upgrade', slotId: 'core' },
  advance_days: { type: 'advance_days', days: 2 },
  force_building: { type: 'force_building', slotId: 'outer_s', buildingId: 'armory', level: 1 },
  remove_building: { type: 'remove_building', slotId: 'outer_n' },
  adjust_coins: { type: 'adjust_coins', wallet: { kind: 'camp' }, delta: { gold: -10, silver: 3 } },
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

describe('applyCommand', () => {
  it.each(Object.values(validCommands))(
    'applies $type into a state that passes the schema',
    (command) => {
      // remove_character needs an empty wallet; everything else runs on the rich state.
      const state =
        command.type === 'remove_character'
          ? { ...richState(), wallets: { camp: { gold: 100 }, characters: { thorin: {} } } }
          : richState();
      const result = run(command, master, state);
      if (!result.ok) throw new Error(`${command.type}: ${result.error}`);
      expect(result.state).not.toBe(state);
      expect(gameStateSchema.safeParse(result.state).success).toBe(true);
    },
  );

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
      name: 'skill above 10',
      input: {
        type: 'npc_update',
        npcId: 'bianca',
        ...npcFields,
        status: 'disponivel',
        skills: { smithing: 11 },
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
    'mission_create',
    'mission_update',
    'mission_remove',
    'mission_take_party',
    'mission_send_npcs',
  ]);
  const masterOnly = Object.values(validCommands).filter((c) => !playerCommands.has(c.type));

  it.each(masterOnly)('refuses $type from a player', (command) => {
    expect(run(command, thorinPlayer)).toEqual({ ok: false, error: 'forbidden' });
  });

  it.each([...playerCommands].map((type) => validCommands[type]))(
    'lets a player run $type',
    (command) => {
      expect(run(command, thorinPlayer).ok).toBe(true);
    },
  );

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

  it('checks permission before touching the state', () => {
    const state = makeState();
    const result = applyCommand(state, testCatalog, validCommands.advance_days, thorinPlayer);
    expect(result).toEqual({ ok: false, error: 'forbidden' });
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
