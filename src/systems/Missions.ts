import type { Catalog } from '../model/catalog';
import type {
  GameState,
  LogEntry,
  Mission,
  MissionDifficulty,
  MissionProgress,
  MissionResult,
  MissionStatus,
  Npc,
} from '../model/schema';
import { builtLevel } from './BuildSystem';
import { idError } from './Categories';
import { addCoins, fromBronze, toBronze, type CoinBag } from './Coins';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';
import { CAMP, setWallet } from './Wallets';

// Contracts on the Guilda board (docs/plans/MISSOES.md). The group or NPCs
// take them; the master decides how they went, so nothing here is random and
// server and client always agree.

export interface MissionFields {
  title: string;
  requester: string;
  location: string;
  description: string;
  reward: CoinBag;
  days: number;
  difficulty: MissionDifficulty;
}

export interface Resolution {
  missionId: string;
  result: MissionResult;
  /** Only used on a failure: NPCs that come back `ferido`. */
  injuredNpcIds: readonly string[];
}

/** How a reward is shared out, in bronze. */
export interface Payout {
  totalBronze: number;
  campBronze: number;
  /** What each NPC earns; 0 for the group. */
  perNpcBronze: number;
}

/** The three tabs of the board. */
export type MissionTab = 'abertas' | 'andamento' | 'concluidas';

const TAB_OF: Readonly<Record<MissionStatus, MissionTab>> = {
  aberta: 'abertas',
  grupo: 'andamento',
  npcs: 'andamento',
  aguardando: 'andamento',
  concluida: 'concluidas',
};

export function missionTab(mission: Mission): MissionTab {
  return TAB_OF[mission.progress.status];
}

/** Percent the Guilda adds to rewards right now (0 below its bonus level). */
export function guildBonusPercent(state: GameState, catalog: Catalog): number {
  const { building, minLevel, percent } = catalog.missions.guildBonus;
  return builtLevel(state, building) >= minLevel ? percent : 0;
}

/**
 * Splits a reward: the group hands it all to the Acampamento; NPCs share
 * `100 − commission`% evenly and every leftover bronze goes to the Acampamento,
 * so no coin is lost to rounding.
 */
export function splitReward(
  rewardBronze: number,
  { bonusPercent, npcCount, commissionPercent }: SplitOptions,
): Payout {
  const totalBronze = Math.floor((rewardBronze * (100 + bonusPercent)) / 100);
  if (npcCount === 0) return { totalBronze, campBronze: totalBronze, perNpcBronze: 0 };
  const npcShare = Math.floor((totalBronze * (100 - commissionPercent)) / 100);
  const perNpcBronze = Math.floor(npcShare / npcCount);
  return { totalBronze, campBronze: totalBronze - perNpcBronze * npcCount, perNpcBronze };
}

interface SplitOptions {
  bonusPercent: number;
  /** 0 when the group did the mission. */
  npcCount: number;
  commissionPercent: number;
}

/** What a success would pay now, for the board to show before the master decides. */
export function expectedPayout(state: GameState, catalog: Catalog, mission: Mission): Payout {
  const { progress } = mission;
  const npcCount = 'npcIds' in progress ? progress.npcIds.length : 0;
  return splitReward(toBronze(mission.reward, catalog.currencies), {
    bonusPercent: guildBonusPercent(state, catalog),
    npcCount,
    commissionPercent: catalog.missions.campCommissionPercent,
  });
}

/** NPCs that may leave on a mission: at home or at work, never hurt or already away. */
export function canGoOnMission(npc: Npc): boolean {
  return npc.status === 'disponivel' || npc.status === 'trabalhando';
}

export function addMission(
  state: GameState,
  catalog: Catalog,
  { id, createdBy, ...fields }: MissionFields & { id: string; createdBy?: string | undefined },
): Outcome {
  const error = idError(id, state.missions) ?? fieldsError(catalog, fields);
  if (error) return fail(error);
  const mission: Mission = {
    ...cleanFields(fields),
    id,
    ...(createdBy ? { createdBy } : {}),
    createdOnDay: state.day,
    progress: { status: 'aberta' },
  };
  return ok(
    withLog(
      { ...state, missions: [...state.missions, mission] },
      entry(state, 'mission_created', mission.title),
    ),
  );
}

/** Only an open mission can be edited. */
export function updateMission(
  state: GameState,
  catalog: Catalog,
  id: string,
  fields: MissionFields,
): Outcome {
  const found = openMission(state, id);
  if (!found.ok) return found;
  const error = fieldsError(catalog, fields);
  if (error) return fail(error);
  const next = { ...found.mission, ...cleanFields(fields) };
  return ok(withLog(replaceMission(state, next), entry(state, 'mission_updated', next.title)));
}

/** Only an open mission can be taken down. */
export function removeMission(state: GameState, id: string): Outcome {
  const found = openMission(state, id);
  if (!found.ok) return found;
  return ok(
    withLog(
      { ...state, missions: state.missions.filter((m) => m.id !== id) },
      entry(state, 'mission_removed', found.mission.title),
    ),
  );
}

export function takeMissionAsParty(state: GameState, id: string): Outcome {
  const found = openMission(state, id);
  if (!found.ok) return found;
  const next: Mission = {
    ...found.mission,
    progress: { status: 'grupo', startedOnDay: state.day },
  };
  return ok(withLog(replaceMission(state, next), entry(state, 'mission_taken', next.title)));
}

/** The NPCs leave today and are due back after the mission's days. */
export function sendNpcsOnMission(
  state: GameState,
  id: string,
  npcIds: readonly string[],
): Outcome {
  const found = openMission(state, id);
  if (!found.ok) return found;
  const ids = [...new Set(npcIds)];
  const team = ids.map((npcId) => state.npcs.find((n) => n.id === npcId));
  if (team.length === 0 || team.some((npc) => !npc)) return fail('not_found');
  const sent = team.filter((npc): npc is Npc => npc !== undefined);
  if (!sent.every(canGoOnMission)) return fail('npc_unavailable');

  const progress: MissionProgress = {
    status: 'npcs',
    npcIds: ids,
    startedOnDay: state.day,
    returnsOnDay: state.day + found.mission.days,
  };
  const away = new Set(ids);
  const npcs = state.npcs.map((npc) =>
    away.has(npc.id) ? { ...npc, status: 'em_missao' as const } : npc,
  );
  return ok(
    withLog(replaceMission({ ...state, npcs }, { ...found.mission, progress }), {
      day: state.day,
      kind: 'mission_npcs_sent',
      title: found.mission.title,
      npcs: sent.map((npc) => npc.name),
    }),
  );
}

/**
 * Master: closes a mission the group took, or one whose NPCs came back. A
 * success pays out (see `splitReward`); either way the NPCs return to work,
 * except the ones hurt in a failure.
 */
export function resolveMission(
  state: GameState,
  catalog: Catalog,
  { missionId, result, injuredNpcIds }: Resolution,
): Outcome {
  const mission = state.missions.find((m) => m.id === missionId);
  if (!mission) return fail('not_found');
  const { progress } = mission;
  if (progress.status !== 'grupo' && progress.status !== 'aguardando') {
    return fail('mission_closed');
  }

  const teamIds = progress.status === 'aguardando' ? progress.npcIds : [];
  const team = state.npcs.filter((npc) => teamIds.includes(npc.id));
  const injured = new Set(
    result === 'falha' ? injuredNpcIds.filter((id) => teamIds.includes(id)) : [],
  );
  const payout =
    result === 'sucesso'
      ? expectedPayout(state, catalog, mission)
      : { totalBronze: 0, campBronze: 0, perNpcBronze: 0 };

  const npcs = state.npcs.map((npc) => {
    if (!teamIds.includes(npc.id)) return npc;
    return backFromMission(npc, { earned: payout.perNpcBronze, isInjured: injured.has(npc.id) });
  });
  const camp = addCoins(state.wallets.camp, fromBronze(payout.campBronze, catalog.currencies));
  const by = progress.status === 'grupo' ? 'grupo' : 'npcs';
  const npcBronze = payout.perNpcBronze * team.length;
  const injuredNames = team.filter((npc) => injured.has(npc.id)).map((npc) => npc.name);
  const resolved: Mission = {
    ...mission,
    progress: {
      status: 'concluida',
      by,
      result,
      resolvedOnDay: state.day,
      campBronze: payout.campBronze,
      npcBronze,
      npcs: team.map((npc) => npc.name),
      injured: injuredNames,
    },
  };
  const paid = setWallet({ ...state, npcs }, CAMP, camp);
  return ok(
    withLog(replaceMission(paid, resolved), {
      day: state.day,
      kind: 'mission_resolved',
      title: mission.title,
      by,
      result,
      campBronze: payout.campBronze,
      npcBronze,
      injured: injuredNames,
    }),
  );
}

/** End of a day: NPC missions due by `state.day` wait for the master. Same state when none is due. */
export function returnFromMissions(state: GameState): GameState {
  const back: LogEntry[] = [];
  const missions = state.missions.map((mission) => {
    const { progress } = mission;
    if (progress.status !== 'npcs' || progress.returnsOnDay > state.day) return mission;
    back.push({ day: progress.returnsOnDay, kind: 'mission_returned', title: mission.title });
    return { ...mission, progress: { ...progress, status: 'aguardando' as const } };
  });
  if (back.length === 0) return state;
  return withLog({ ...state, missions }, ...back);
}

/**
 * NPCs removed while away leave their mission; a mission left with nobody is
 * open again. Same state when nothing changes.
 */
export function settleMissions(state: GameState): GameState {
  const known = new Set(state.npcs.map((npc) => npc.id));
  const reopened: LogEntry[] = [];
  let changed = false;
  const missions = state.missions.map((mission) => {
    const { progress } = mission;
    if (progress.status !== 'npcs' && progress.status !== 'aguardando') return mission;
    const npcIds = progress.npcIds.filter((id) => known.has(id));
    if (npcIds.length === progress.npcIds.length) return mission;
    changed = true;
    const [first, ...rest] = npcIds;
    if (first === undefined) {
      reopened.push(entry(state, 'mission_reopened', mission.title));
      return { ...mission, progress: { status: 'aberta' as const } };
    }
    return { ...mission, progress: { ...progress, npcIds: [first, ...rest] } };
  });
  if (!changed) return state;
  return withLog({ ...state, missions }, ...reopened);
}

function backFromMission(npc: Npc, { earned, isInjured }: { earned: number; isInjured: boolean }) {
  const earnings = (npc.earnings ?? 0) + earned;
  const status = isInjured ? 'ferido' : npc.job ? 'trabalhando' : 'disponivel';
  return { ...npc, status, ...(earnings > 0 ? { earnings } : {}) } satisfies Npc;
}

type Found = { ok: true; mission: Mission } | { ok: false; error: ActionError };

function openMission(state: GameState, id: string): Found {
  const mission = state.missions.find((m) => m.id === id);
  if (!mission) return { ok: false, error: 'not_found' };
  if (mission.progress.status !== 'aberta') return { ok: false, error: 'mission_closed' };
  return { ok: true, mission };
}

function fieldsError(catalog: Catalog, fields: MissionFields): ActionError | null {
  if (!fields.title.trim()) return 'empty_name';
  const currencyIds = new Set(catalog.currencies.map((c) => c.id));
  if (Object.keys(fields.reward).some((id) => !currencyIds.has(id))) return 'not_found';
  return toBronze(fields.reward, catalog.currencies) > 0 ? null : 'empty_reward';
}

function cleanFields(fields: MissionFields): MissionFields {
  return {
    title: fields.title.trim(),
    requester: fields.requester.trim(),
    location: fields.location.trim(),
    description: fields.description,
    reward: Object.fromEntries(Object.entries(fields.reward).filter(([, n]) => n > 0)),
    days: fields.days,
    difficulty: fields.difficulty,
  };
}

function replaceMission(state: GameState, next: Mission): GameState {
  return { ...state, missions: state.missions.map((m) => (m.id === next.id ? next : m)) };
}

function entry<
  K extends
    | 'mission_created'
    | 'mission_updated'
    | 'mission_removed'
    | 'mission_taken'
    | 'mission_reopened',
>(state: GameState, kind: K, title: string) {
  return { day: state.day, kind, title };
}
