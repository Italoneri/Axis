import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import type {
  BuildingLevel,
  GameState,
  JobDef,
  LogEntry,
  Npc,
  NpcJob,
  NpcReleaseReason,
  NpcStatus,
} from '../model/schema';
import { activeLevel } from './BuildSystem';
import { idError, nameError } from './Categories';
import { fail, ok, withLog, type ActionError, type Outcome } from './outcome';

// NPCs live in housing and work at posts. Capacity and posts come from the level
// in force (`activeLevel`): an upgrade keeps the building working at its current
// level, and a first construction offers only the construction post.

/** A post a slot offers right now. */
export interface Post {
  slotId: string;
  buildingId: string;
  job: JobDef;
  /** How many NPCs can work it at once. */
  slots: number;
}

export interface NpcFields {
  name: string;
  title: string;
  portrait?: string | undefined;
  description: string;
  skills: Readonly<Record<string, number>>;
  wage?: number | undefined;
}

export type NpcEdit = NpcFields & { status: NpcStatus };

export interface JobOrder {
  slotId: string;
  activityId: string;
  researchId?: string | undefined;
}

/**
 * Yield in tenths, kept integer so daily sums stay exact: `base × (1 + skill / 10)`,
 * or `base × skill / negativeDivisor` for a negative skill, which works against the post.
 */
export function yieldTenths(base: number, skill: number, negativeDivisor: number): number {
  if (skill < 0) return Math.round((base * skill * 10) / negativeDivisor);
  return Math.round(base * (10 + skill));
}

/** What this NPC adds to the post each day, in tenths; bonus posts have no amount. */
export function postYieldTenths(catalog: Catalog, post: Post, npc: Npc): number {
  const { effect, skill } = post.job;
  if (effect.type === 'bonus') return 0;
  return yieldTenths(effect.perDay, skillOf(npc, skill), catalog.npcs.negativeDivisor);
}

export function skillOf(npc: Npc, skillId: string): number {
  return npc.skills[skillId] ?? 0;
}

export function housingCapacity(state: GameState, catalog: Catalog, slotId: string): number {
  return levelInForce(state, catalog, slotId)?.housing?.capacity ?? 0;
}

/**
 * Building posts take their openings from the slot type and the level in force
 * (`postSlots`); the construction post keeps its own.
 */
export function postsAt(state: GameState, catalog: Catalog, slotId: string): Post[] {
  const placed = state.slots[slotId];
  if (!placed) return [];
  const { buildingId } = placed;
  const slotType = findSlot(catalog, slotId)?.type;
  const openings = slotType
    ? (catalog.npcs.postSlots[slotType]?.[activeLevel(placed) - 1] ?? 0)
    : 0;
  const jobs = (levelInForce(state, catalog, slotId)?.jobs ?? []).map((job) => ({
    slotId,
    buildingId,
    job,
    slots: openings,
  }));
  const { construction } = catalog.npcs;
  const constructionPost =
    placed.status === 'building'
      ? [{ slotId, buildingId, job: construction, slots: construction.slots }]
      : [];
  return [...jobs, ...constructionPost];
}

export function findPost(
  state: GameState,
  catalog: Catalog,
  { slotId, activityId }: { slotId: string; activityId: string },
): Post | undefined {
  return postsAt(state, catalog, slotId).find((post) => post.job.activity === activityId);
}

export interface Housing {
  slotId: string;
  buildingId: string;
  capacity: number;
  residents: number;
}

/** Buildings with housing at their level in force, in slot order. */
export function housingList(state: GameState, catalog: Catalog): Housing[] {
  return Object.entries(state.slots).flatMap(([slotId, placed]) => {
    const capacity = housingCapacity(state, catalog, slotId);
    if (capacity === 0) return [];
    const residents = residentsOf(state, slotId).length;
    return [{ slotId, buildingId: placed.buildingId, capacity, residents }];
  });
}

export function residentsOf(state: GameState, slotId: string): Npc[] {
  return state.npcs.filter((npc) => npc.home === slotId);
}

export function workersAt(state: GameState, post: Post): Npc[] {
  return state.npcs.filter(
    (npc) => npc.job?.slotId === post.slotId && npc.job.activityId === post.job.activity,
  );
}

/** Whether the NPC works today (wages permitting): injured or away NPCs keep their post idle. */
export function isOnDuty(npc: Npc): npc is Npc & { job: NpcJob } {
  return npc.job !== null && npc.status === 'trabalhando';
}

export function addNpc(
  state: GameState,
  catalog: Catalog,
  fields: NpcFields & { id: string },
): Outcome {
  const error = idError(fields.id, state.npcs) ?? fieldsError(state, catalog, fields);
  if (error) return fail(error);
  const npc: Npc = {
    ...cleanFields(fields),
    id: fields.id,
    home: null,
    job: null,
    status: 'disponivel',
  };
  return ok(withLog({ ...state, npcs: [...state.npcs, npc] }, entry(state, 'npc_added', npc.name)));
}

export function updateNpc(state: GameState, catalog: Catalog, id: string, edit: NpcEdit): Outcome {
  const npc = state.npcs.find((n) => n.id === id);
  if (!npc) return fail('not_found');
  const error = fieldsError(state, catalog, edit, id);
  if (error) return fail(error);
  const fields = cleanFields(edit);
  // New skills mean a new yield: the leftover tenths of the old one are dropped.
  const job =
    npc.job && !sameSkills(npc.skills, fields.skills) ? { ...npc.job, carry: 0 } : npc.job;
  const next: Npc = {
    ...fields,
    id,
    home: npc.home,
    job,
    status: settledStatus(edit.status, job),
    ...(npc.earnings ? { earnings: npc.earnings } : {}),
  };
  return ok(withLog(replaceNpc(state, next), entry(state, 'npc_updated', next.name)));
}

export function removeNpc(state: GameState, id: string): Outcome {
  const npc = state.npcs.find((n) => n.id === id);
  if (!npc) return fail('not_found');
  return ok(
    withLog(
      { ...state, npcs: state.npcs.filter((n) => n.id !== id) },
      entry(state, 'npc_removed', npc.name),
    ),
  );
}

/** `null` moves the NPC out, which also frees its post (work needs a home). */
export function setNpcHome(
  state: GameState,
  catalog: Catalog,
  { npcId, slotId }: { npcId: string; slotId: string | null },
): Outcome {
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('not_found');
  if (npc.home === slotId) return ok(state);
  if (slotId === null) {
    const next = { ...npc, home: null, job: null, status: settledStatus(npc.status, null) };
    const unassigned = npc.job ? [entry(state, 'npc_unassigned', npc.name)] : [];
    return ok(
      withLog(replaceNpc(state, next), ...unassigned, entry(state, 'npc_home_set', npc.name)),
    );
  }

  const capacity = housingCapacity(state, catalog, slotId);
  if (capacity === 0) return fail('no_housing');
  if (residentsOf(state, slotId).length >= capacity) return fail('home_full');
  const place = state.slots[slotId]?.buildingId ?? '';
  return ok(
    withLog(replaceNpc(state, { ...npc, home: slotId }), {
      ...entry(state, 'npc_home_set', npc.name),
      place,
    }),
  );
}

/** One job at a time: assigning again moves the NPC to the new post. */
export function assignNpcJob(
  state: GameState,
  catalog: Catalog,
  npcId: string,
  order: JobOrder,
): Outcome {
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('not_found');
  const check = jobError(state, catalog, npc, order);
  if (!check.ok) return fail(check.error);
  const { post, researchId } = check;
  if (isSameJob(npc.job, { ...order, researchId })) return ok(state);

  const job: NpcJob = {
    slotId: order.slotId,
    activityId: order.activityId,
    ...(researchId ? { researchId } : {}),
    carry: 0,
  };
  const next = { ...npc, job, status: settledStatus(npc.status, job) };
  return ok(
    withLog(replaceNpc(state, next), {
      day: state.day,
      kind: 'npc_job_set',
      npc: npc.name,
      place: post.buildingId,
      activity: post.job.name,
    }),
  );
}

export function unassignNpc(state: GameState, npcId: string): Outcome {
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('not_found');
  if (!npc.job) return ok(state);
  const next = { ...npc, job: null, status: settledStatus(npc.status, null) };
  return ok(withLog(replaceNpc(state, next), entry(state, 'npc_unassigned', npc.name)));
}

/**
 * Frees homes and posts that no longer exist or no longer fit (a removed
 * building, a lower level forced by the master, a finished construction, a
 * closed research), in list order, logging each release. Keeps the very same
 * state when nothing changes.
 */
export function settleNpcs(state: GameState, catalog: Catalog): GameState {
  const homeUse = new Map<string, number>();
  const postUse = new Map<string, number>();
  const released: LogEntry[] = [];

  const npcs = state.npcs.map((npc) => {
    const homeReason = npc.home && homeProblem(state, catalog, npc.home, homeUse);
    const home = homeReason ? null : npc.home;
    if (home) homeUse.set(home, (homeUse.get(home) ?? 0) + 1);

    const jobReason = npc.job && jobProblem(state, catalog, { job: npc.job, home }, postUse);
    const job = jobReason ? null : npc.job;
    if (job) postUse.set(postKey(job), (postUse.get(postKey(job)) ?? 0) + 1);

    if (homeReason) released.push(release(state, npc, 'home', homeReason));
    if (jobReason) released.push(release(state, npc, 'job', jobReason));
    if (!homeReason && !jobReason) return npc;
    return { ...npc, home, job, status: settledStatus(npc.status, job) };
  });
  if (released.length === 0) return state;
  return withLog({ ...state, npcs }, ...released);
}

/**
 * Residents of a building that no longer offers housing (saves from when the
 * Taverna and the Torre dos Magos housed NPCs) move to housing with room,
 * keeping their post. Whoever does not fit is left for `settleNpcs` to release.
 */
export function rehomeNpcs(state: GameState, catalog: Catalog): GameState {
  const homes = housingList(state, catalog);
  const moved: LogEntry[] = [];
  const npcs = state.npcs.map((npc) => {
    const oldHome = npc.home ? state.slots[npc.home] : undefined;
    if (!npc.home || !oldHome || housingCapacity(state, catalog, npc.home) > 0) return npc;
    const home = homes.find((h) => h.residents < h.capacity);
    if (!home) return npc;
    home.residents += 1;
    moved.push({
      day: state.day,
      kind: 'npc_moved',
      npc: npc.name,
      from: oldHome.buildingId,
      place: home.buildingId,
    });
    return { ...npc, home: home.slotId };
  });
  if (moved.length === 0) return state;
  return withLog({ ...state, npcs }, ...moved);
}

/** `disponivel` and `trabalhando` follow the job; the master's `ferido`/`em_missao` stay. */
export function settledStatus(status: NpcStatus, job: NpcJob | null): NpcStatus {
  if (status === 'ferido' || status === 'em_missao') return status;
  return job ? 'trabalhando' : 'disponivel';
}

function levelInForce(
  state: GameState,
  catalog: Catalog,
  slotId: string,
): BuildingLevel | undefined {
  const placed = state.slots[slotId];
  if (!placed) return undefined;
  const level = activeLevel(placed);
  return findBuilding(catalog, placed.buildingId)?.levels[level - 1];
}

type JobCheck = { ok: true; post: Post; researchId?: string } | { ok: false; error: ActionError };

function jobError(state: GameState, catalog: Catalog, npc: Npc, order: JobOrder): JobCheck {
  if (!npc.home) return { ok: false, error: 'no_home' };
  const post = findPost(state, catalog, order);
  if (!post) return { ok: false, error: 'invalid_post' };
  const others = workersAt(state, post).filter((worker) => worker.id !== npc.id);
  if (others.length >= post.slots) return { ok: false, error: 'post_full' };
  if (post.job.effect.type !== 'research') return { ok: true, post };

  const target = state.research.entries.find((r) => r.id === order.researchId);
  if (target?.status !== 'em_andamento') return { ok: false, error: 'invalid_target' };
  return { ok: true, post, researchId: target.id };
}

function isSameJob(job: NpcJob | null, order: JobOrder): boolean {
  return (
    job !== null &&
    job.slotId === order.slotId &&
    job.activityId === order.activityId &&
    job.researchId === order.researchId
  );
}

function homeProblem(
  state: GameState,
  catalog: Catalog,
  home: string,
  used: ReadonlyMap<string, number>,
): NpcReleaseReason | null {
  if (!state.slots[home]) return 'building_removed';
  const isFull = (used.get(home) ?? 0) >= housingCapacity(state, catalog, home);
  return isFull ? 'capacity' : null;
}

function jobProblem(
  state: GameState,
  catalog: Catalog,
  { job, home }: { job: NpcJob; home: string | null },
  used: ReadonlyMap<string, number>,
): NpcReleaseReason | null {
  const placed = state.slots[job.slotId];
  if (!placed) return 'building_removed';
  const post = findPost(state, catalog, job);
  if (!post) {
    const wasConstruction = job.activityId === catalog.npcs.construction.activity;
    return wasConstruction ? 'construction_done' : 'capacity';
  }
  if ((used.get(postKey(job)) ?? 0) >= post.slots) return 'capacity';
  if (post.job.effect.type === 'research' && !isOpenResearch(state, job.researchId)) {
    return 'research_closed';
  }
  return home ? null : 'no_home';
}

function isOpenResearch(state: GameState, researchId: string | undefined): boolean {
  return state.research.entries.some((r) => r.id === researchId && r.status === 'em_andamento');
}

function postKey(job: NpcJob): string {
  return `${job.slotId}/${job.activityId}`;
}

function release(
  state: GameState,
  npc: Npc,
  from: 'home' | 'job',
  reason: NpcReleaseReason,
): LogEntry {
  return { day: state.day, kind: 'npc_released', npc: npc.name, from, reason };
}

function fieldsError(
  state: GameState,
  catalog: Catalog,
  fields: NpcFields,
  ownId?: string,
): ActionError | null {
  const known = new Set(catalog.skills.map((s) => s.id));
  const hasUnknownSkill = Object.keys(fields.skills).some((id) => !known.has(id));
  return nameError(fields.name, state.npcs, ownId) ?? (hasUnknownSkill ? 'not_found' : null);
}

function cleanFields(fields: NpcFields): Omit<Npc, 'id' | 'home' | 'job' | 'status' | 'earnings'> {
  const portrait = fields.portrait?.trim();
  const wage = fields.wage && fields.wage > 0 ? fields.wage : undefined;
  return {
    name: fields.name.trim(),
    title: fields.title.trim(),
    ...(portrait ? { portrait } : {}),
    description: fields.description,
    skills: Object.fromEntries(Object.entries(fields.skills).filter(([, level]) => level !== 0)),
    ...(wage ? { wage } : {}),
  };
}

function sameSkills(a: Npc['skills'], b: Npc['skills']): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...ids].every((id) => (a[id] ?? 0) === (b[id] ?? 0));
}

function replaceNpc(state: GameState, next: Npc): GameState {
  return { ...state, npcs: state.npcs.map((npc) => (npc.id === next.id ? next : npc)) };
}

function entry<
  K extends 'npc_added' | 'npc_updated' | 'npc_removed' | 'npc_unassigned' | 'npc_home_set',
>(state: GameState, kind: K, npc: string) {
  return { day: state.day, kind, npc };
}
