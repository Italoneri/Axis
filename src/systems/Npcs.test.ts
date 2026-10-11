import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand';
import type { GameState } from '../model/schema';
import {
  addNpc,
  assignNpcJob,
  housingCapacity,
  postsAt,
  setNpcHome,
  settleNpcs,
  unassignNpc,
  updateNpc,
  yieldTenths,
} from './Npcs';
import { makeState, npc, testCatalog } from './testFixtures';

const research = {
  id: 'runes',
  title: 'Runas',
  category: 'arcana',
  description: '',
  notes: '',
  status: 'em_andamento',
  progress: 10,
} as const;

function base(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    slots: {
      core: { buildingId: 'heart', level: 1, status: 'done' },
      outer_n: { buildingId: 'forge', level: 1, status: 'done' },
      outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
    },
    research: { ...makeState().research, entries: [research] },
    npcs: [
      npc({ id: 'bianca', name: 'Bianca', skills: { research: 4 }, home: 'outer_e' }),
      npc({ id: 'gus', name: 'Gus', skills: { smithing: 10 }, home: 'outer_e' }),
      npc({ id: 'tomas', name: 'Tomás' }),
    ],
    ...overrides,
  });
}

function expectOk(outcome: ReturnType<typeof addNpc>): GameState {
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.state;
}

const forjar = { slotId: 'outer_n', activityId: 'forjar' };

describe('yieldTenths', () => {
  it.each([
    { base: 1, skill: 0, tenths: 10 },
    { base: 1, skill: 4, tenths: 14 },
    { base: 2, skill: 7, tenths: 34 },
    { base: 3, skill: 10, tenths: 60 },
    { base: 0.5, skill: 3, tenths: 7 },
  ])('turns base $base at skill $skill into $tenths tenths', ({ base, skill, tenths }) => {
    expect(yieldTenths(base, skill)).toBe(tenths);
  });
});

describe('housing and posts', () => {
  it('use the level in force, so an upgrade keeps the current one working', () => {
    const upgrading = base({
      slots: {
        ...base().slots,
        outer_e: {
          buildingId: 'barracks',
          level: 2,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 3,
        },
      },
    });
    expect(housingCapacity(upgrading, testCatalog, 'outer_e')).toBe(2);
    expect(settleNpcs(upgrading, testCatalog)).toBe(upgrading);
    expect(postsAt(upgrading, testCatalog, 'outer_e').map((p) => p.job.activity)).toEqual([
      'construir',
    ]);
  });

  it('offer nothing but the construction post on a first construction', () => {
    const state = base({
      slots: {
        outer_s: {
          buildingId: 'barracks',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 3,
        },
      },
    });
    expect(housingCapacity(state, testCatalog, 'outer_s')).toBe(0);
    expect(postsAt(state, testCatalog, 'outer_s').map((p) => p.job.activity)).toEqual([
      'construir',
    ]);
  });
});

describe('setNpcHome', () => {
  it('respects the capacity of the level in force', () => {
    const refused = setNpcHome(base(), testCatalog, { npcId: 'tomas', slotId: 'outer_e' });
    expect(refused).toEqual({ ok: false, error: 'home_full' });

    const roomier = base({
      slots: { ...base().slots, outer_e: { buildingId: 'barracks', level: 2, status: 'done' } },
    });
    const moved = expectOk(setNpcHome(roomier, testCatalog, { npcId: 'tomas', slotId: 'outer_e' }));
    expect(moved.npcs.find((n) => n.id === 'tomas')?.home).toBe('outer_e');
    expect(moved.log.at(-1)).toMatchObject({
      kind: 'npc_home_set',
      npc: 'Tomás',
      place: 'barracks',
    });
  });

  it.each([
    { place: 'a building without housing', slotId: 'outer_n' },
    { place: 'an empty slot', slotId: 'outer_w' },
    { place: 'a slot that does not exist', slotId: 'nowhere' },
    { place: 'a first construction', slotId: 'outer_s' },
  ])('refuses $place with no_housing', ({ slotId }) => {
    const state = base({
      slots: {
        ...base().slots,
        outer_s: {
          buildingId: 'barracks',
          level: 1,
          status: 'building',
          startedOnDay: 1,
          completesOnDay: 3,
        },
      },
    });
    const outcome = setNpcHome(state, testCatalog, { npcId: 'tomas', slotId });
    expect(outcome).toEqual({ ok: false, error: 'no_housing' });
  });

  it('frees the post when the NPC moves out', () => {
    const working = expectOk(assignNpcJob(base(), testCatalog, 'gus', forjar));
    const out = expectOk(setNpcHome(working, testCatalog, { npcId: 'gus', slotId: null }));
    expect(out.npcs.find((n) => n.id === 'gus')).toMatchObject({
      home: null,
      job: null,
      status: 'disponivel',
    });
  });
});

describe('assignNpcJob', () => {
  it('puts the NPC to work and marks it as working', () => {
    const state = expectOk(assignNpcJob(base(), testCatalog, 'gus', forjar));
    expect(state.npcs.find((n) => n.id === 'gus')).toMatchObject({
      job: { ...forjar, carry: 0 },
      status: 'trabalhando',
    });
    expect(state.log.at(-1)).toEqual({
      day: 1,
      kind: 'npc_job_set',
      npc: 'Gus',
      place: 'forge',
      activity: 'Forjar',
    });
  });

  it.each([
    { name: 'without a home', npcId: 'tomas', order: forjar, error: 'no_home' },
    {
      name: 'at a post the building does not offer',
      npcId: 'gus',
      order: { slotId: 'outer_n', activityId: 'rezar' },
      error: 'invalid_post',
    },
    {
      name: 'at an empty slot',
      npcId: 'gus',
      order: { slotId: 'outer_s', activityId: 'forjar' },
      error: 'invalid_post',
    },
    {
      name: 'at a research post without a research in progress',
      npcId: 'bianca',
      order: { slotId: 'core', activityId: 'estudar' },
      error: 'invalid_target',
    },
  ])('refuses work $name', ({ npcId, order, error }) => {
    expect(assignNpcJob(base(), testCatalog, npcId, order)).toEqual({ ok: false, error });
  });

  it('refuses a full post', () => {
    const taken = expectOk(assignNpcJob(base(), testCatalog, 'gus', forjar));
    expect(assignNpcJob(taken, testCatalog, 'bianca', forjar)).toEqual({
      ok: false,
      error: 'post_full',
    });
  });

  it('accepts an NPC without the post skill (it works at the base rate)', () => {
    expect(assignNpcJob(base(), testCatalog, 'bianca', forjar).ok).toBe(true);
  });

  it('keeps one job at a time, moving the NPC to the new post', () => {
    const forging = expectOk(assignNpcJob(base(), testCatalog, 'bianca', forjar));
    const order = { slotId: 'core', activityId: 'estudar', researchId: 'runes' };
    const studying = expectOk(assignNpcJob(forging, testCatalog, 'bianca', order));
    expect(studying.npcs.find((n) => n.id === 'bianca')?.job).toEqual({ ...order, carry: 0 });
    expect(assignNpcJob(studying, testCatalog, 'bianca', order)).toEqual({
      ok: true,
      state: studying,
    });
  });

  it('keeps an injured NPC injured', () => {
    const injured = base({
      npcs: base().npcs.map((n) => (n.id === 'gus' ? { ...n, status: 'ferido' as const } : n)),
    });
    const state = expectOk(assignNpcJob(injured, testCatalog, 'gus', forjar));
    expect(state.npcs.find((n) => n.id === 'gus')?.status).toBe('ferido');
    const freed = expectOk(unassignNpc(state, 'gus'));
    expect(freed.npcs.find((n) => n.id === 'gus')).toMatchObject({ job: null, status: 'ferido' });
  });
});

describe('addNpc and updateNpc', () => {
  const fields = { name: 'Lia', title: 'Curandeira', description: '', skills: { research: 3 } };

  it('refuses unknown skills and repeated names', () => {
    expect(addNpc(base(), testCatalog, { ...fields, id: 'x', skills: { juggling: 2 } })).toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(addNpc(base(), testCatalog, { ...fields, id: 'x', name: 'bianca' })).toEqual({
      ok: false,
      error: 'duplicate_name',
    });
  });

  it('derives disponivel/trabalhando from the job', () => {
    const working = expectOk(assignNpcJob(base(), testCatalog, 'gus', forjar));
    const edited = expectOk(
      updateNpc(working, testCatalog, 'gus', { ...fields, name: 'Gus', status: 'disponivel' }),
    );
    expect(edited.npcs.find((n) => n.id === 'gus')?.status).toBe('trabalhando');
  });
});

describe('settleNpcs', () => {
  const master = { actor: { role: 'master' } } as const;

  function working(): GameState {
    const forging = expectOk(assignNpcJob(base(), testCatalog, 'gus', forjar));
    const order = { slotId: 'core', activityId: 'estudar', researchId: 'runes' };
    return expectOk(assignNpcJob(forging, testCatalog, 'bianca', order));
  }

  it('frees homes and posts of a removed building, logging each release', () => {
    const outcome = applyCommand(
      working(),
      testCatalog,
      { type: 'remove_building', slotId: 'outer_e' },
      master,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.state.npcs.map((n) => [n.home, n.job])).toEqual([
      [null, null],
      [null, null],
      [null, null],
    ]);
    expect(outcome.logged.filter((e) => e.kind === 'npc_released')).toEqual([
      expect.objectContaining({ npc: 'Bianca', from: 'home', reason: 'building_removed' }),
      expect.objectContaining({ npc: 'Bianca', from: 'job', reason: 'no_home' }),
      expect.objectContaining({ npc: 'Gus', from: 'home', reason: 'building_removed' }),
      expect.objectContaining({ npc: 'Gus', from: 'job', reason: 'no_home' }),
    ]);
  });

  it('frees the workers of a removed workplace', () => {
    const outcome = applyCommand(
      working(),
      testCatalog,
      { type: 'remove_building', slotId: 'outer_n' },
      master,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.state.npcs.find((n) => n.id === 'gus')).toMatchObject({
      home: 'outer_e',
      job: null,
      status: 'disponivel',
    });
  });

  it('moves out the residents beyond a lower capacity, last in the list first', () => {
    const crowded = base({
      slots: { ...base().slots, outer_e: { buildingId: 'barracks', level: 2, status: 'done' } },
      npcs: [...base().npcs.slice(0, 2), npc({ id: 'tomas', name: 'Tomás', home: 'outer_e' })],
    });
    const forced = { type: 'force_building', slotId: 'outer_e', buildingId: 'barracks', level: 1 };
    const outcome = applyCommand(crowded, testCatalog, forced, master);
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.state.npcs.map((n) => n.home)).toEqual(['outer_e', 'outer_e', null]);
    expect(outcome.logged.at(-1)).toMatchObject({
      kind: 'npc_released',
      npc: 'Tomás',
      reason: 'capacity',
    });
  });

  it('frees the researchers of a completed research', () => {
    const outcome = applyCommand(
      working(),
      testCatalog,
      { type: 'complete_research', researchId: 'runes' },
      master,
    );
    if (!outcome.ok) throw new Error(outcome.error);
    expect(outcome.state.npcs.find((n) => n.id === 'bianca')?.job).toBeNull();
    expect(outcome.logged.at(-1)).toMatchObject({ reason: 'research_closed' });
  });

  it('keeps the very same state when everything still fits', () => {
    const state = working();
    expect(settleNpcs(state, testCatalog)).toBe(state);
  });
});
