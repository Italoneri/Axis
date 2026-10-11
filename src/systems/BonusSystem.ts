import type { Catalog } from '../model/catalog';
import type { GameState, JobEffect } from '../model/schema';
import { builtLevel } from './BuildSystem';
import { findPost, isOnDuty, postYieldTenths } from './Npcs';

export interface ActiveBonus {
  buildingId: string;
  name: string;
  level: number;
  /** Effects of every level reached so far: level bonuses accumulate. */
  effects: string[];
}

/** Bonuses currently in force, in catalog order, for players to consult during the session. */
export function activeBonuses(state: GameState, catalog: Catalog): ActiveBonus[] {
  return catalog.buildings.flatMap((def) => {
    const level = builtLevel(state, def.id);
    if (level === 0) return [];
    const effects = def.levels.slice(0, level).map((l) => l.effect);
    return [{ buildingId: def.id, name: def.name, level, effects }];
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
}

/** Effects of the posts in use, in the order their first worker appears in the NPC list. */
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
    });
  }, new Map<string, PostEffect>());
  return [...byPost.values()];
}
