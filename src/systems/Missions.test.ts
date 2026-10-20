import { describe, expect, it } from 'vitest';
import { applyCommand } from '../commands/applyCommand';
import type { CommandContext } from '../commands/schema';
import {
  gameStateSchema,
  type GameState,
  type Mission,
  type Npc,
  type NpcAttributes,
} from '../model/schema';
import { toBronze } from './Coins';
import {
  addMission,
  attributePoints,
  expectedPayout,
  guildBonusPercent,
  missionDays,
  resolveMission,
  sendNpcsOnMission,
  splitReward,
  teamPoints,
} from './Missions';
import { advanceDays } from './TimeSystem';
import { makeState, mission, npc, testCatalog } from './testFixtures';

const master: CommandContext = { actor: { role: 'master' } };
const player: CommandContext = { actor: { role: 'player', characterId: 'thorin' } };
const noBonus = { bonusPercent: 0, commissionPercent: 20 };

const bia = npc({
  id: 'bia',
  name: 'Bia',
  home: 'outer_e',
  job: { slotId: 'outer_n', activityId: 'forjar', carry: 0 },
  status: 'trabalhando',
});
const caio = npc({ id: 'caio', name: 'Caio' });
const duda = npc({ id: 'duda', name: 'Duda' });
const ferido = npc({ id: 'eli', name: 'Eli', status: 'ferido' });

function board(overrides: Partial<GameState> = {}): GameState {
  return makeState({
    day: 5,
    wallets: { camp: {}, characters: { thorin: {} } },
    slots: {
      outer_n: { buildingId: 'forge', level: 1, status: 'done' },
      outer_e: { buildingId: 'barracks', level: 1, status: 'done' },
    },
    npcs: [bia, caio, duda, ferido],
    missions: [mission({ id: 'caca', title: 'Caçada', reward: { gold: 2 }, days: 3 })],
    ...overrides,
  });
}

function ok(outcome: { ok: true; state: GameState } | { ok: false; error: string }): GameState {
  if (!outcome.ok) throw new Error(outcome.error);
  expect(gameStateSchema.safeParse(outcome.state).success).toBe(true);
  return outcome.state;
}

const camp = (state: GameState) => toBronze(state.wallets.camp, testCatalog.currencies);
const npcOf = (state: GameState, id: string): Npc | undefined =>
  state.npcs.find((n) => n.id === id);
const missionOf = (state: GameState, id = 'caca'): Mission | undefined =>
  state.missions.find((m) => m.id === id);

/** Sends the NPCs, advances to their return and resolves the mission. */
function sendAndResolve(
  npcIds: string[],
  resolution: { result: 'sucesso' | 'falha'; injuredNpcIds?: string[] },
  state = board(),
): GameState {
  const sent = ok(sendNpcsOnMission(state, testCatalog, { missionId: 'caca', npcIds }));
  const back = advanceDays(sent, testCatalog, 3, []).state;
  return ok(
    resolveMission(back, testCatalog, {
      missionId: 'caca',
      result: resolution.result,
      injuredNpcIds: resolution.injuredNpcIds ?? [],
    }),
  );
}

describe('splitReward', () => {
  it.each([
    { name: 'the group', npcCount: 0, camp: 200, perNpc: 0 },
    { name: 'one NPC', npcCount: 1, camp: 40, perNpc: 160 },
    // 160 / 3 = 53 each; the 1 bronze left over stays with the Acampamento.
    { name: 'three NPCs', npcCount: 3, camp: 41, perNpc: 53 },
  ])('shares 2 PO with $name', ({ npcCount, camp, perNpc }) => {
    const payout = splitReward(200, { ...noBonus, npcCount });
    expect(payout).toEqual({ totalBronze: 200, campBronze: camp, perNpcBronze: perNpc });
    expect(payout.campBronze + payout.perNpcBronze * npcCount).toBe(200);
  });

  it('adds the Guilda bonus before splitting', () => {
    expect(splitReward(200, { bonusPercent: 10, commissionPercent: 20, npcCount: 1 })).toEqual({
      totalBronze: 220,
      campBronze: 44,
      perNpcBronze: 176,
    });
  });

  it('never loses a coin, whatever the split', () => {
    for (let reward = 1; reward < 400; reward += 7) {
      for (let npcCount = 1; npcCount <= 5; npcCount++) {
        const payout = splitReward(reward, { bonusPercent: 10, commissionPercent: 20, npcCount });
        expect(payout.campBronze + payout.perNpcBronze * npcCount).toBe(payout.totalBronze);
      }
    }
  });
});

describe('guildBonusPercent', () => {
  it.each([
    { name: 'no Guilda', slots: {}, bonus: 0 },
    { name: 'Guilda nv. 1', slots: { outer_s: guild(1) }, bonus: 0 },
    { name: 'Guilda nv. 2', slots: { outer_s: guild(2) }, bonus: 10 },
    {
      name: 'Guilda upgrading to nv. 2',
      slots: {
        outer_s: { ...guild(2), status: 'building', startedOnDay: 1, completesOnDay: 9 },
      },
      bonus: 0,
    },
  ] as const)('is $bonus with $name', ({ slots, bonus }) => {
    expect(guildBonusPercent(makeState({ slots }), testCatalog)).toBe(bonus);
  });
});

describe('missions with the group', () => {
  it('pays the whole reward to the Acampamento on a success', () => {
    const taken = run(board(), { type: 'mission_take_party', missionId: 'caca' }, player);
    const done = run(taken, resolveCommand('sucesso'));
    expect(camp(done)).toBe(200);
    expect(missionOf(done)?.progress).toMatchObject({
      status: 'concluida',
      by: 'grupo',
      result: 'sucesso',
      campBronze: 200,
      npcBronze: 0,
    });
  });

  it('pays 10% more with the Guilda at nv. 2', () => {
    const state = board({ slots: { ...board().slots, outer_s: guild(2) } });
    const taken = run(state, { type: 'mission_take_party', missionId: 'caca' });
    expect(camp(run(taken, resolveCommand('sucesso')))).toBe(220);
  });

  it('pays nothing on a failure', () => {
    const taken = run(board(), { type: 'mission_take_party', missionId: 'caca' });
    const failed = run(taken, resolveCommand('falha'));
    expect(camp(failed)).toBe(0);
    expect(missionOf(failed)?.progress).toMatchObject({ status: 'concluida', result: 'falha' });
  });
});

describe('missions with NPCs', () => {
  it('sends available and working NPCs away, keeping home and post', () => {
    const sent = ok(
      sendNpcsOnMission(board(), testCatalog, { missionId: 'caca', npcIds: ['bia', 'caio'] }),
    );
    expect(npcOf(sent, 'bia')).toMatchObject({
      status: 'em_missao',
      home: 'outer_e',
      job: bia.job,
    });
    expect(npcOf(sent, 'caio')?.status).toBe('em_missao');
    expect(missionOf(sent)?.progress).toEqual({
      status: 'npcs',
      npcIds: ['bia', 'caio'],
      startedOnDay: 5,
      returnsOnDay: 8,
    });
  });

  it('refuses hurt NPCs and NPCs already away', () => {
    expect(sendNpcsOnMission(board(), testCatalog, { missionId: 'caca', npcIds: ['eli'] })).toEqual(
      {
        ok: false,
        error: 'npc_unavailable',
      },
    );
    const away = board({ npcs: [{ ...caio, status: 'em_missao' }] });
    expect(
      sendNpcsOnMission(away, testCatalog, { missionId: 'caca', npcIds: ['caio'] }),
    ).toMatchObject({ error: 'npc_unavailable' });
  });

  it('waits for the master on the return day, not before', () => {
    const sent = ok(
      sendNpcsOnMission(board(), testCatalog, { missionId: 'caca', npcIds: ['caio'] }),
    );
    const early = advanceDays(sent, testCatalog, 2, []).state;
    expect(missionOf(early)?.progress.status).toBe('npcs');
    const back = advanceDays(sent, testCatalog, 5, []).state;
    expect(missionOf(back)?.progress.status).toBe('aguardando');
    expect(back.log).toContainEqual({ day: 8, kind: 'mission_returned', title: 'Caçada' });
    // Still away until the master decides.
    expect(npcOf(back, 'caio')?.status).toBe('em_missao');
  });

  it('does not let the master resolve before the NPCs are back', () => {
    const sent = ok(
      sendNpcsOnMission(board(), testCatalog, { missionId: 'caca', npcIds: ['caio'] }),
    );
    const early = resolveMission(sent, testCatalog, {
      missionId: 'caca',
      result: 'sucesso',
      injuredNpcIds: [],
    });
    expect(early).toEqual({ ok: false, error: 'mission_closed' });
  });

  it.each([
    { name: 'one NPC', npcIds: ['caio'], each: 160, camp: 40 },
    { name: 'three NPCs', npcIds: ['bia', 'caio', 'duda'], each: 53, camp: 41 },
  ])('splits 80/20 with $name on a success', ({ npcIds, each, camp: campBronze }) => {
    const done = sendAndResolve(npcIds, { result: 'sucesso' });
    expect(camp(done)).toBe(campBronze);
    npcIds.forEach((id) => expect(npcOf(done, id)?.earnings).toBe(each));
    expect(missionOf(done)?.progress).toMatchObject({
      by: 'npcs',
      campBronze,
      npcBronze: each * npcIds.length,
    });
  });

  it('adds what the NPC already earned', () => {
    const rich = board({ npcs: [{ ...caio, earnings: 15 }] });
    expect(npcOf(sendAndResolve(['caio'], { result: 'sucesso' }, rich), 'caio')?.earnings).toBe(
      175,
    );
  });

  it('puts the NPCs back to work, or to rest, after the mission', () => {
    const done = sendAndResolve(['bia', 'caio'], { result: 'sucesso' });
    expect(npcOf(done, 'bia')?.status).toBe('trabalhando');
    expect(npcOf(done, 'caio')?.status).toBe('disponivel');
  });

  it('pays nothing on a failure and hurts only the NPCs the master marks', () => {
    const done = sendAndResolve(['bia', 'caio'], { result: 'falha', injuredNpcIds: ['bia'] });
    expect(camp(done)).toBe(0);
    expect(npcOf(done, 'bia')).toMatchObject({ status: 'ferido', job: bia.job });
    expect(npcOf(done, 'bia')?.earnings).toBeUndefined();
    expect(npcOf(done, 'caio')?.status).toBe('disponivel');
    expect(missionOf(done)?.progress).toMatchObject({ result: 'falha', injured: ['Bia'] });
  });

  it('ignores injuries on a success', () => {
    const done = sendAndResolve(['bia'], { result: 'sucesso', injuredNpcIds: ['bia'] });
    expect(npcOf(done, 'bia')?.status).toBe('trabalhando');
  });

  it('shows the expected payout with the team that left', () => {
    const sent = ok(
      sendNpcsOnMission(board(), testCatalog, {
        missionId: 'caca',
        npcIds: ['bia', 'caio', 'duda'],
      }),
    );
    const sentMission = missionOf(sent);
    if (!sentMission) throw new Error('mission missing');
    expect(expectedPayout(sent, testCatalog, sentMission)).toEqual({
      totalBronze: 200,
      campBronze: 41,
      perNpcBronze: 53,
    });
  });
});

describe('NPC removed during a mission', () => {
  it('leaves the mission, which keeps the others', () => {
    const sent = run(board(), {
      type: 'mission_send_npcs',
      missionId: 'caca',
      npcIds: ['bia', 'caio'],
    });
    const removed = run(sent, { type: 'npc_remove', npcId: 'bia' });
    expect(missionOf(removed)?.progress).toMatchObject({ status: 'npcs', npcIds: ['caio'] });
  });

  it('opens the mission again when nobody is left', () => {
    const sent = run(board(), { type: 'mission_send_npcs', missionId: 'caca', npcIds: ['caio'] });
    const result = applyCommand(sent, testCatalog, { type: 'npc_remove', npcId: 'caio' }, master);
    if (!result.ok) throw new Error(result.error);
    expect(missionOf(result.state)?.progress).toEqual({ status: 'aberta' });
    expect(result.logged.map((entry) => entry.kind)).toEqual(['npc_removed', 'mission_reopened']);
  });
});

describe('mission board edits', () => {
  const fields = {
    title: '  Escolta  ',
    requester: 'Astor',
    location: 'Tarrafet',
    description: '',
    reward: { silver: 5, gold: 0 },
    days: 4,
    difficulty: 'dificil',
  } as const;

  it('creates an open mission, recording who and when', () => {
    const state = ok(
      addMission(board(), testCatalog, { ...fields, id: 'm1', createdBy: 'Thorin' }),
    );
    expect(missionOf(state, 'm1')).toEqual({
      ...fields,
      id: 'm1',
      title: 'Escolta',
      reward: { silver: 5 },
      createdBy: 'Thorin',
      createdOnDay: 5,
      progress: { status: 'aberta' },
    });
  });

  it('records the player who created it, through the command', () => {
    const state = run(board(), { type: 'mission_create', id: 'm1', ...fields }, player);
    expect(missionOf(state, 'm1')?.createdBy).toBe('Thorin');
    expect(state.log.at(-1)).toMatchObject({ kind: 'mission_created', actor: 'Thorin' });
  });

  it.each([
    { name: 'an empty title', change: { title: '  ' }, error: 'empty_name' },
    { name: 'no reward', change: { reward: { gold: 0 } }, error: 'empty_reward' },
    { name: 'an unknown coin', change: { reward: { mithril: 1 } }, error: 'not_found' },
  ])('refuses $name', ({ change, error }) => {
    expect(addMission(board(), testCatalog, { ...fields, ...change, id: 'm1' })).toEqual({
      ok: false,
      error,
    });
  });

  it.each([
    { name: 'a title over 120 characters', change: { title: 'x'.repeat(121) } },
    { name: 'a description over 4.000 characters', change: { description: 'x'.repeat(4001) } },
    { name: 'zero days', change: { days: 0 } },
    { name: 'more than 365 days', change: { days: 366 } },
  ])('refuses $name as an invalid command', ({ change }) => {
    const command = { type: 'mission_create', id: 'm1', ...fields, ...change };
    expect(applyCommand(board(), testCatalog, command, master)).toEqual({
      ok: false,
      error: 'invalid_command',
    });
  });

  it('edits and removes only open missions', () => {
    const taken = run(board(), { type: 'mission_take_party', missionId: 'caca' });
    const update = { type: 'mission_update', missionId: 'caca', ...fields };
    expect(applyCommand(taken, testCatalog, update, player)).toEqual({
      ok: false,
      error: 'mission_closed',
    });
    const remove = { type: 'mission_remove', missionId: 'caca' };
    expect(applyCommand(taken, testCatalog, remove, player)).toEqual({
      ok: false,
      error: 'mission_closed',
    });
    const removed = run(board(), remove, player);
    expect(removed.missions).toEqual([]);
    expect(removed.log.at(-1)).toMatchObject({ kind: 'mission_removed', title: 'Caçada' });
  });

  it('lets only the master resolve a mission', () => {
    const taken = run(board(), { type: 'mission_take_party', missionId: 'caca' }, player);
    expect(applyCommand(taken, testCatalog, resolveCommand('sucesso'), player)).toEqual({
      ok: false,
      error: 'forbidden',
    });
  });

  it('keeps the NPC earnings when the master edits the NPC', () => {
    const rich = board({ npcs: [{ ...caio, earnings: 40 }] });
    const edited = run(rich, {
      type: 'npc_update',
      npcId: 'caio',
      name: 'Caio',
      title: 'Batedor',
      description: '',
      skills: {},
      status: 'disponivel',
    });
    expect(npcOf(edited, 'caio')?.earnings).toBe(40);
  });

  it('keeps missions and NPCs away when the Guilda is removed', () => {
    const state = board({ slots: { ...board().slots, outer_s: guild(1) } });
    const sent = run(state, { type: 'mission_send_npcs', missionId: 'caca', npcIds: ['caio'] });
    const removed = run(sent, { type: 'remove_building', slotId: 'outer_s' });
    expect(missionOf(removed)?.progress.status).toBe('npcs');
    expect(npcOf(removed, 'caio')?.status).toBe('em_missao');
  });
});

function guild(level: number) {
  return { buildingId: 'guild', level, status: 'done' } as const;
}

function resolveCommand(result: 'sucesso' | 'falha') {
  return { type: 'mission_resolve', missionId: 'caca', result } as const;
}

function run(state: GameState, command: unknown, ctx: CommandContext = master): GameState {
  const result = applyCommand(state, testCatalog, command, ctx);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe('mission days from the team attributes', () => {
  const { missions: config } = testCatalog;
  const adventurer = (id: string, attributes: NpcAttributes) => npc({ id, name: id, attributes });
  const twenty = (id: string) => adventurer(id, { strength: 7, dexterity: 7, magic: 6 });
  const daysFor = (team: Npc[]) => missionDays(10, teamPoints(team, config), config);

  it.each([
    { name: 'nobody with attributes', team: [npc({ id: 'a', name: 'A' })], points: 0, days: 10 },
    { name: '1 NPC with 20 points', team: [twenty('a')], points: 20, days: 8 },
    { name: '2 NPCs like that', team: [twenty('a'), twenty('b')], points: 40, days: 6 },
    { name: '3 NPCs like that', team: ['a', 'b', 'c'].map(twenty), points: 60, days: 5 },
    { name: '4 NPCs like that', team: ['a', 'b', 'c', 'd'].map(twenty), points: 80, days: 4 },
    {
      name: 'a hero 15/15/15',
      team: [adventurer('h', { strength: 15, dexterity: 15, magic: 15 })],
      points: 120,
      days: 4,
    },
    {
      name: 'a goddess 20/20/20',
      team: [adventurer('g', { strength: 20, dexterity: 20, magic: 20 })],
      points: 480,
      days: 1,
    },
    {
      name: 'an NPC -10/-10/-10 (twice the deadline at most)',
      team: [adventurer('w', { strength: -10, dexterity: -10, magic: -10 })],
      points: -30,
      days: 20,
    },
  ])('a 10-day mission with $name takes $days days', ({ team, points, days }) => {
    expect(teamPoints(team, config)).toBe(points);
    expect(daysFor(team)).toBe(days);
  });

  it('counts levels up to 10 as themselves and the table above', () => {
    expect([-10, 0, 7, 10].map((level) => attributePoints(level, config))).toEqual([-10, 0, 7, 10]);
    expect([11, 15, 20].map((level) => attributePoints(level, config))).toEqual([13, 40, 160]);
  });

  it('rounds up, never goes under 1 day and never divides by zero or less', () => {
    expect(missionDays(3, 20, config)).toBe(3); // 480 / 220 = 2.18 → 3
    expect(missionDays(1, 480, config)).toBe(1);
    expect(missionDays(1, 10_000, config)).toBe(1);
    expect(missionDays(10, -54, config)).toBe(20); // divisor 160 − 162 < 0
    expect(missionDays(10, -160 / 3, config)).toBe(20);
  });

  it('sets the return day on leaving; editing attributes later does not move it', () => {
    const fast = { ...caio, attributes: { strength: 20, dexterity: 20, magic: 20 } };
    const state = board({ npcs: [bia, fast, duda, ferido] });
    const sent = ok(sendNpcsOnMission(state, testCatalog, { missionId: 'caca', npcIds: ['caio'] }));
    expect(missionOf(sent)?.progress).toMatchObject({ startedOnDay: 5, returnsOnDay: 6 });

    const edited = applyCommand(
      sent,
      testCatalog,
      {
        type: 'npc_update',
        npcId: 'caio',
        name: 'Caio',
        title: '',
        description: '',
        skills: {},
        attributes: { strength: -10, dexterity: -10, magic: -10 },
        status: 'em_missao',
      },
      master,
    );
    if (!edited.ok) throw new Error(edited.error);
    expect(missionOf(edited.state)?.progress).toMatchObject({ returnsOnDay: 6 });
  });

  it('leaves missions the group takes as they were', () => {
    const fast = { ...caio, attributes: { strength: 20, dexterity: 20, magic: 20 } };
    const state = board({ npcs: [bia, fast, duda, ferido] });
    const taken = applyCommand(
      state,
      testCatalog,
      { type: 'mission_take_party', missionId: 'caca' },
      master,
    );
    if (!taken.ok) throw new Error(taken.error);
    expect(missionOf(taken.state)?.progress).toEqual({ status: 'grupo', startedOnDay: 5 });
  });
});
