import { goldInBronze, type Catalog } from '../model/catalog';
import type { GameState, JobEffect, LogEntry, NpcJob } from '../model/schema';
import { goldToBronze, pay } from './Coins';
import { findPost, isOnDuty, skillOf, yieldTenths } from './Npcs';
import { CAMP, setWallet } from './Wallets';

// One day of NPC work: wages first, then the effects of the posts that were
// paid for. Deterministic (no randomness), so server and client agree.

type WorkEffect = Exclude<JobEffect['type'], 'bonus'>;

/** What an advance adds up across its days, logged once at the end. */
export interface WorkTally {
  readonly wagesBronze: number;
  /** Days without pay, by NPC name (names are unique). */
  readonly unpaid: ReadonlyMap<string, number>;
  /** Whole units delivered, by NPC id and target. */
  readonly delivered: ReadonlyMap<string, Delivery>;
}

interface Delivery {
  npc: string;
  effect: WorkEffect;
  target: string;
  amount: number;
}

export const EMPTY_TALLY: WorkTally = { wagesBronze: 0, unpaid: new Map(), delivered: new Map() };

interface WorkDay {
  state: GameState;
  tally: WorkTally;
}

/** Runs `state.day` as a work day: pays wages, then applies the effects of every paid post. */
export function workOneDay(state: GameState, catalog: Catalog, tally: WorkTally): WorkDay {
  const paid = payWages(state, catalog, tally);
  return paid.workers.reduce<WorkDay>((day, npcId) => work(day, catalog, npcId), {
    state: paid.state,
    tally: paid.tally,
  });
}

export function tallyLog(tally: WorkTally, day: number): LogEntry[] {
  return [
    ...[...tally.delivered.values()]
      .filter((d) => d.amount > 0)
      .map((d): LogEntry => ({ day, kind: 'npc_worked', ...d })),
    ...(tally.wagesBronze > 0
      ? [{ day, kind: 'npc_wages_paid', bronze: tally.wagesBronze } as const]
      : []),
    ...[...tally.unpaid.entries()].map(([npc, days]): LogEntry => ({
      day,
      kind: 'npc_unpaid',
      npc,
      days,
    })),
  ];
}

/** In list order; an NPC the Acampamento cannot pay sits the day out. */
function payWages(state: GameState, catalog: Catalog, tally: WorkTally) {
  const onDuty = state.npcs.filter(isOnDuty);
  return onDuty.reduce(
    (acc, npc) => {
      const bronze = goldToBronze(npc.wage ?? 0, goldInBronze(catalog));
      if (bronze === 0) return { ...acc, workers: [...acc.workers, npc.id] };
      const payment = pay(acc.state.wallets.camp, bronze, catalog.currencies);
      if (!payment.ok) {
        const days = (acc.tally.unpaid.get(npc.name) ?? 0) + 1;
        const unpaid = new Map(acc.tally.unpaid).set(npc.name, days);
        return { ...acc, tally: { ...acc.tally, unpaid } };
      }
      return {
        state: setWallet(acc.state, CAMP, payment.wallet),
        tally: { ...acc.tally, wagesBronze: acc.tally.wagesBronze + bronze },
        workers: [...acc.workers, npc.id],
      };
    },
    { state, tally, workers: [] as string[] },
  );
}

function work({ state, tally }: WorkDay, catalog: Catalog, npcId: string): WorkDay {
  const npc = state.npcs.find((n) => n.id === npcId);
  const post = npc?.job && findPost(state, catalog, npc.job);
  if (!npc?.job || !post || post.job.effect.type === 'bonus') return { state, tally };

  const { effect, skill } = { effect: post.job.effect, skill: post.job.skill };
  const tenths = yieldTenths(effect.perDay, skillOf(npc, skill)) + npc.job.carry;
  const units = Math.floor(tenths / 10);
  const result = deliver(state, { effect, job: npc.job, units });
  // A blocked target (research at 100%, construction due today) drops the leftover tenths.
  const carry = result.amount < units ? 0 : tenths % 10;
  const next = setCarry(result.state, npc.id, carry);
  if (!result.target) return { state: next, tally };

  const key = `${npc.id}/${effect.type}/${result.target}`;
  const amount = (tally.delivered.get(key)?.amount ?? 0) + result.amount;
  const delivery: Delivery = { npc: npc.name, effect: effect.type, target: result.target, amount };
  const delivered = new Map(tally.delivered).set(key, delivery);
  return { state: next, tally: { ...tally, delivered } };
}

type WorkingEffect = Exclude<JobEffect, { type: 'bonus' }>;

interface DeliveryOrder {
  effect: WorkingEffect;
  job: NpcJob;
  units: number;
}

interface Delivered {
  state: GameState;
  amount: number;
  /** Material name, research title or building id; absent when the target is gone. */
  target?: string;
}

function deliver(state: GameState, { effect, job, units }: DeliveryOrder): Delivered {
  switch (effect.type) {
    case 'produce':
      return produce(state, effect.material, units);
    case 'research':
      return advanceResearch(state, job.researchId, units);
    case 'construction':
      return speedUpConstruction(state, job.slotId, units);
    default:
      return assertNever(effect);
  }
}

/** A material the master deleted produces nothing. */
function produce(state: GameState, materialId: string, units: number): Delivered {
  const material = state.materials.items.find((m) => m.id === materialId);
  if (!material) return { state, amount: 0 };
  const items = state.materials.items.map((m) =>
    m.id === materialId ? { ...m, quantity: m.quantity + units } : m,
  );
  return {
    state: { ...state, materials: { ...state.materials, items } },
    amount: units,
    target: material.name,
  };
}

/** Stops at 100%: the master completes the research. */
function advanceResearch(
  state: GameState,
  researchId: string | undefined,
  units: number,
): Delivered {
  const entry = state.research.entries.find((r) => r.id === researchId);
  if (entry?.status !== 'em_andamento') return { state, amount: 0 };
  const progress = Math.min(100, entry.progress + units);
  const amount = progress - entry.progress;
  if (amount === 0) return { state, amount, target: entry.title };

  const entries = state.research.entries.map((r) =>
    r.id === entry.id ? { ...entry, progress } : r,
  );
  const next = { ...state, research: { ...state.research, entries } };
  const ready: LogEntry[] =
    progress === 100 ? [{ day: state.day, kind: 'research_ready', title: entry.title }] : [];
  return { state: { ...next, log: [...next.log, ...ready] }, amount, target: entry.title };
}

/** Takes days off the construction, never finishing it before the day being worked. */
function speedUpConstruction(state: GameState, slotId: string, units: number): Delivered {
  const placed = state.slots[slotId];
  if (placed?.status !== 'building') return { state, amount: 0 };
  const completesOnDay = Math.max(state.day, placed.completesOnDay - units);
  const amount = placed.completesOnDay - completesOnDay;
  const slots = { ...state.slots, [slotId]: { ...placed, completesOnDay } };
  return { state: { ...state, slots }, amount, target: placed.buildingId };
}

function setCarry(state: GameState, npcId: string, carry: number): GameState {
  const npcs = state.npcs.map((npc) =>
    npc.id === npcId && npc.job ? { ...npc, job: { ...npc.job, carry } } : npc,
  );
  return { ...state, npcs };
}

function assertNever(value: never): never {
  throw new Error(`unhandled work effect: ${JSON.stringify(value)}`);
}
