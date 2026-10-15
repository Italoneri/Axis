import type { Catalog } from '../model/catalog';
import type { GameState, JobEffect } from '../model/schema';
import { activeLevel, builtLevel } from './BuildSystem';
import { findPost, isOnDuty, postYieldTenths, skillOf } from './Npcs';

export interface ActiveBonus {
  buildingId: string;
  name: string;
  level: number;
  /** Party texts of every level reached so far (levels accumulate); unwritten ones left out. */
  party: string[];
  /** Axis texts of every level reached so far; unwritten ones left out. */
  axis: string[];
  /** Copies in force (Alojamentos): their effects still count once, at the highest level. */
  count: number;
}

/** Bonuses currently in force, in catalog order, for players to consult during the session. */
export function activeBonuses(state: GameState, catalog: Catalog): ActiveBonus[] {
  return catalog.buildings.flatMap((def) => {
    const level = builtLevel(state, def.id);
    if (level === 0) return [];
    const reached = def.levels.slice(0, level);
    const party = reached.map((l) => l.party).filter(Boolean);
    const axis = reached.map((l) => l.axis).filter(Boolean);
    const count = Object.values(state.slots).filter(
      (placed) => placed.buildingId === def.id && activeLevel(placed) >= 1,
    ).length;
    return [{ buildingId: def.id, name: def.name, level, party, axis, count }];
  });
}

/** A post with at least one NPC on duty, and what it yields per day. */
export interface PostEffect {
  slotId: string;
  buildingId: string;
  activity: string;
  workers: string[];
  effect: JobEffect;
  /** Sum of the workers' daily yield in tenths; 0 for a bonus. */
  tenthsPerDay: number;
  /** Some worker has a negative skill: a bonus post shows its `penalty` instead. */
  hindered: boolean;
}

/**
 * Effects of the posts in use, in the order their first worker appears in the NPC list.
 * A hindered bonus post without a `penalty` text is left out.
 */
export function activePostEffects(state: GameState, catalog: Catalog): PostEffect[] {
  const byPost = state.npcs.filter(isOnDuty).reduce((posts, npc) => {
    const post = findPost(state, catalog, npc.job);
    if (!post) return posts;
    const key = `${post.slotId}/${post.job.activity}`;
    const { effect } = post.job;
    const tenths = postYieldTenths(catalog, post, npc);
    const previous = posts.get(key);
    return new Map(posts).set(key, {
      slotId: post.slotId,
      buildingId: post.buildingId,
      activity: post.job.name,
      workers: [...(previous?.workers ?? []), npc.name],
      effect,
      tenthsPerDay: (previous?.tenthsPerDay ?? 0) + tenths,
      hindered: (previous?.hindered ?? false) || skillOf(npc, post.job.skill) < 0,
    });
  }, new Map<string, PostEffect>());
  return [...byPost.values()].filter(
    (post) => !(post.hindered && post.effect.type === 'bonus' && !post.effect.penalty),
  );
}
