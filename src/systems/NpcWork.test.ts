import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand';
import type { GameCommand } from '../commands/schema';
import type { GameState, Npc } from '../model/schema';
import { createInitialState } from './SaveSystem';
import { advanceDays } from './TimeSystem';
import { makeState, npc, testCatalog } from './testFixtures';

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
