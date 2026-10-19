import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand';
import type { GameCommand } from '../commands/schema';
import { ARCANE_LAB_BUILDING_ID, type Catalog } from '../model/catalog';
import type { Brew, GameState, JobDef, Npc } from '../model/schema';
import { createInitialState } from './SaveSystem';
import { advanceDays } from './TimeSystem';
import { arcaneLabCatalog, makeState, npc, testCatalog, withIron } from './testFixtures';

const research = {
  id: 'runes',
  title: 'Runas',
  category: 'arcana',
  description: '',
  notes: '',
  status: 'em_andamento',
  progress: 95,
} as const;

const forger = (overrides: Partial<Npc> = {}) =>
  npc({
    id: 'gus',
    name: 'Gus',
    skills: { smithing: 4 },
    home: 'outer_e',
    job: { slotId: 'outer_n', activityId: 'forjar', carry: 0 },
    status: 'trabalhando',
    ...overrides,
  });

const student = (overrides: Partial<Npc> = {}) =>
  npc({
    id: 'bia',
    name: 'Bia',
    home: 'outer_e',
    job: { slotId: 'core', activityId: 'estudar', researchId: 'runes', carry: 0 },
    status: 'trabalhando',
    ...overrides,
  });

function base(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    slots: {
      core: { buildingId: 'heart', level: 1, status: 'done' },
      outer_n: { buildingId: 'forge', level: 1, status: 'done' },
      outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
    },
    research: { ...makeState().research, entries: [research] },
    ...overrides,
  });
}

const iron = (state: GameState) => state.materials.items.find((m) => m.id === 'iron')?.quantity;
const advance = (state: GameState, days: number) => advanceDays(state, testCatalog, days).state;

describe('NPC work on advanceDays', () => {
  it('accumulates the fraction and delivers whole units (1,4 per day)', () => {
    const afterThree = advance(base({ npcs: [forger()] }), 3);
    expect(iron(afterThree)).toBe(4);
    expect(afterThree.npcs[0]?.job?.carry).toBe(2);
    expect(iron(advance(afterThree, 2))).toBe(7);
    expect(afterThree.log).toContainEqual({
      day: 4,
      kind: 'npc_worked',
      npc: 'Gus',
      effect: 'produce',
      amount: 4,
      target: 'Ferro',
    });
  });

  it('pays wages from the Acampamento and logs the total', () => {
    const state = advance(base({ npcs: [forger({ wage: 2 })] }), 3);
    expect(state.wallets.camp).toEqual({ gold: 94 });
    expect(state.log).toContainEqual({ day: 4, kind: 'npc_wages_paid', bronze: 600 });
  });

  it('skips the work of an NPC the Acampamento cannot pay, in list order', () => {
    const state = base({
      wallets: { ...makeState().wallets, camp: { gold: 1 } },
      npcs: [student({ wage: 1 }), forger({ wage: 1 })],
    });
    const next = advance(state, 2);
    expect(next.wallets.camp).toEqual({});
    expect(iron(next)).toBe(0);
    expect(next.log).toContainEqual({ day: 3, kind: 'npc_unpaid', npc: 'Gus', days: 2 });
    expect(next.log).toContainEqual({ day: 3, kind: 'npc_unpaid', npc: 'Bia', days: 1 });
  });

  it('leaves injured NPCs idle and unpaid', () => {
    const next = advance(base({ npcs: [forger({ status: 'ferido', wage: 1 })] }), 3);
    expect(iron(next)).toBe(0);
    expect(next.wallets.camp).toEqual({ gold: 100 });
  });

  it('stops research at 100%, logs it once and leaves completion to the master', () => {
    const next = advance(base({ npcs: [student({ skills: { research: 10 } })] }), 5);
    expect(next.research.entries[0]).toMatchObject({ status: 'em_andamento', progress: 100 });
    expect(next.log.filter((e) => e.kind === 'research_ready')).toEqual([
      { day: 3, kind: 'research_ready', title: 'Runas' },
    ]);
    expect(next.npcs[0]?.job).not.toBeNull();
  });

  it('runs wages, then posts, then completions, then frees the builders', () => {
    const builder = npc({
      id: 'ana',
      name: 'Ana',
      skills: { construction: 10 },
      home: 'outer_e',
      job: { slotId: 'outer_s', activityId: 'construir', carry: 0 },
      status: 'trabalhando',
      wage: 1,
    });
    const state = base({
      slots: {
        ...base().slots,
        outer_s: {
          buildingId: 'armory',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 6,
        },
      },
      npcs: [builder],
    });
    // Day 2: paid, then 2 days off (6 → 4). Day 3: 4 → 3, so it completes on day 3.
    const { state: next, completedSlotIds } = advanceDays(state, testCatalog, 3);
    expect(completedSlotIds).toEqual(['outer_s']);
    expect(next.wallets.camp).toEqual({ gold: 98 });
    expect(next.log.map((e) => e.kind)).toEqual([
      'build_completed',
      'npc_released',
      'npc_worked',
      'npc_wages_paid',
      'days_advanced',
    ]);
    expect(next.log[0]).toMatchObject({ day: 3, buildingId: 'armory' });
    expect(next.log[1]).toMatchObject({ day: 3, reason: 'construction_done', from: 'job' });
    expect(next.log[2]).toMatchObject({ amount: 3, target: 'armory' });
    expect(next.npcs[0]).toMatchObject({ job: null, status: 'disponivel' });
  });

  it('is deterministic: the same state and commands give the same result', () => {
    const master = { actor: { role: 'master' } } as const;
    const commands: GameCommand[] = [
      { type: 'force_building', slotId: 'outer_e', buildingId: 'barracks', level: 1 },
      { type: 'force_building', slotId: 'outer_n', buildingId: 'forge', level: 2 },
      {
        type: 'npc_create',
        id: 'npc_gus',
        name: 'Gus',
        title: 'Ferreiro',
        description: '',
        skills: { smithing: 7 },
        wage: 0.35,
      },
      { type: 'npc_set_home', npcId: 'npc_gus', slotId: 'outer_e' },
      { type: 'npc_assign_job', npcId: 'npc_gus', slotId: 'outer_n', activityId: 'forjar' },
      { type: 'advance_days', days: 17 },
    ];
    const play = () =>
      commands.reduce((state, command) => {
        const outcome = applyCommand(state, testCatalog, command, master);
        if (!outcome.ok) throw new Error(`${command.type}: ${outcome.error}`);
        return outcome.state;
      }, createInitialState(testCatalog));
    const first = play();
    expect(JSON.stringify(play())).toBe(JSON.stringify(first));
    // 3,4 per day for 17 days: 57,8 → 57 delivered.
    expect(iron(first)).toBe(57);
  });
});

const stock = (quantity: number) => withIron(quantity).materials;
const worked = (state: GameState) => state.log.filter((e) => e.kind === 'npc_worked');

describe('NPCs with negative skills', () => {
  it('carries signed tenths over the days (-0,6 Ferro per day)', () => {
    const state = base({ npcs: [forger({ skills: { smithing: -3 } })], materials: stock(10) });
    const afterTwo = advance(state, 2);
    expect(iron(afterTwo)).toBe(9);
    expect(afterTwo.npcs[0]?.job?.carry).toBe(-2);
    expect(iron(advance(afterTwo, 3))).toBe(7);
    expect(worked(afterTwo)).toEqual([
      { day: 3, kind: 'npc_worked', npc: 'Gus', effect: 'produce', amount: -1, target: 'Ferro' },
    ]);
  });

  it.each([
    { name: 'enough stock', quantity: 10, left: 6, amounts: [-4] },
    { name: 'too little stock', quantity: 3, left: 0, amounts: [-3] },
    { name: 'an empty stock', quantity: 0, left: 0, amounts: [] },
  ])('spoils material from $name, never below 0', ({ quantity, left, amounts }) => {
    const state = base({
      npcs: [forger({ skills: { smithing: -10 } })],
      materials: stock(quantity),
    });
    const next = advance(state, 2);
    expect(iron(next)).toBe(left);
    expect(worked(next).map((e) => e.kind === 'npc_worked' && e.amount)).toEqual(amounts);
    expect(next.npcs[0]?.job?.carry).toBe(0);
  });

  it('sets research back from 100% and stops at 0%', () => {
    const hindering = student({ skills: { research: -10 } });
    const ready = { ...research, progress: 100 };
    const fromReady = advance(
      base({ npcs: [hindering], research: { ...makeState().research, entries: [ready] } }),
      1,
    );
    expect(fromReady.research.entries[0]).toMatchObject({ status: 'em_andamento', progress: 96 });

    const nearZero = { ...research, progress: 6 };
    const next = advance(
      base({ npcs: [hindering], research: { ...makeState().research, entries: [nearZero] } }),
      3,
    );
    expect(next.research.entries[0]).toMatchObject({ progress: 0 });
    expect(worked(next)).toEqual([
      { day: 4, kind: 'npc_worked', npc: 'Bia', effect: 'research', amount: -6, target: 'Runas' },
    ]);
  });

  it('delays the construction it works on', () => {
    const clumsy = npc({
      id: 'ana',
      name: 'Ana',
      skills: { construction: -5 },
      home: 'outer_e',
      job: { slotId: 'outer_s', activityId: 'construir', carry: 0 },
      status: 'trabalhando',
    });
    const building = {
      buildingId: 'armory',
      level: 1,
      status: 'building',
      startedOnDay: 1,
      completesOnDay: 3,
    } as const;
    const next = advance(
      base({ slots: { ...base().slots, outer_s: building }, npcs: [clumsy] }),
      2,
    );
    expect(next.slots['outer_s']).toMatchObject({ status: 'building', completesOnDay: 5 });
    expect(worked(next)).toEqual([
      {
        day: 3,
        kind: 'npc_worked',
        npc: 'Ana',
        effect: 'construction',
        amount: -2,
        target: 'armory',
      },
    ]);
  });

  it('counts each worker on a post apart, so a good and a bad one cancel out', () => {
    const job = { slotId: 'outer_n', activityId: 'forjar', carry: 0 };
    const state = base({
      slots: { ...base().slots, outer_n: { buildingId: 'forge', level: 2, status: 'done' } },
      materials: stock(10),
      npcs: [
        forger({ skills: {}, job }),
        forger({ id: 'tom', name: 'Tom', skills: { smithing: -5 }, job }),
      ],
    });
    const next = advance(state, 3);
    expect(iron(next)).toBe(10);
    expect(worked(next).map((e) => e.kind === 'npc_worked' && [e.npc, e.amount])).toEqual([
      ['Gus', 6],
      ['Tom', -6],
    ]);
  });
});

describe('NPCs supervising lab brews', () => {
  const supervise: JobDef = {
    activity: 'supervisionar',
    name: 'Supervisionar preparos',
    skill: 'research',
    effect: { type: 'brewing', perDay: 1 },
  };
  const catalog: Catalog = {
    ...arcaneLabCatalog,
    buildings: arcaneLabCatalog.buildings.map((b) =>
      b.id === ARCANE_LAB_BUILDING_ID
        ? { ...b, levels: b.levels.map((level) => ({ ...level, jobs: [supervise] })) }
        : b,
    ),
  };
  const brewing = (progressTenths: number): Brew => ({
    recipeId: 'r',
    outputId: 'iron',
    outputQty: 1,
    days: 9,
    spent: [],
    progressTenths,
  });
  const alchemist = (skill: number) =>
    npc({
      id: 'lia',
      name: 'Lia',
      skills: { research: skill },
      home: 'outer_e',
      job: { slotId: 'outer_w', activityId: 'supervisionar', carry: 0 },
      status: 'trabalhando',
    });
  const labWith = (stations: Record<string, Brew>, worker: Npc) =>
    base({
      slots: {
        ...base().slots,
        outer_w: { buildingId: ARCANE_LAB_BUILDING_ID, level: 2, status: 'done' },
      },
      npcs: [worker],
      lab: { recipes: [], stations },
    });
  const progressOf = (state: GameState) =>
    Object.fromEntries(
      Object.entries(state.lab.stations).map(([id, brew]) => [id, brew.progressTenths]),
    );

  it('speedsEveryBrewInTheLab', () => {
    const start = labWith({ 'alambique-1': brewing(0), 'caldeirao-1': brewing(30) }, alchemist(0));
    const next = advanceDays(start, catalog, 1).state;
    expect(progressOf(next)).toEqual({ 'alambique-1': 20, 'caldeirao-1': 50 });
    expect(worked(next)).toEqual([
      {
        day: 2,
        kind: 'npc_worked',
        npc: 'Lia',
        effect: 'brewing',
        amount: 1,
        target: 'arcane_lab',
      },
    ]);
  });

  it('slowsBrewsWithoutGoingBelowZero', () => {
    const start = labWith({ 'alambique-1': brewing(30), 'alambique-2': brewing(0) }, alchemist(-5));
    const next = advanceDays(start, catalog, 1).state;
    expect(progressOf(next)).toEqual({ 'alambique-1': 30, 'alambique-2': 10 });
  });

  it('doesNothingWithoutBrews', () => {
    const next = advanceDays(labWith({}, alchemist(0)), catalog, 1).state;
    expect(worked(next)).toEqual([]);
    expect(next.npcs[0]?.job?.carry).toBe(0);
  });
});
