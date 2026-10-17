import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import type { GameState, LogEntry } from '../model/schema';
import { hasRoomFor, startBuild, startUpgrade, type BlockReason } from '../systems/BuildSystem';
import {
  addCharacter,
  joinWithNewCharacter,
  logPlayerChange,
  removeCharacter,
  updateCharacter,
  type CharacterFields,
} from '../systems/Characters';
import type { DepotDelivery } from '../systems/Depot';
import { setWorldInfluence } from '../systems/Influence';
import { forceBuilding, removeBuilding } from '../systems/MasterSystem';
import {
  addMaterial,
  addMaterialCategory,
  adjustMaterial,
  removeMaterial,
  removeMaterialCategory,
  renameMaterialCategory,
  updateMaterial,
  type MaterialFields,
} from '../systems/Materials';
import { ok, trimLog, withLog, type ActionError, type Outcome } from '../systems/outcome';
import {
  addResearch,
  addResearchCategory,
  completeResearch,
  removeResearch,
  removeResearchCategory,
  renameResearchCategory,
  updateResearch,
} from '../systems/Research';
import {
  addNpc,
  assignNpcJob,
  removeNpc,
  setNpcHome,
  settleNpcs,
  unassignNpc,
  updateNpc,
  type NpcFields,
} from '../systems/Npcs';
import {
  addMission,
  removeMission,
  resolveMission,
  sendNpcsOnMission,
  settleMissions,
  takeMissionAsParty,
  updateMission,
  type MissionFields,
} from '../systems/Missions';
import {
  addShopItem,
  buyFromShop,
  buyMaterials,
  removeShopItem,
  sellToShop,
  setShopPromotion,
  updateShopItem,
} from '../systems/Shop';
import { isUploadFor, looksLikeUpload, setImage } from '../systems/GameImages';
import { advanceDays } from '../systems/TimeSystem';
import {
  adjustCoins,
  consolidateWallet,
  depositToCamp,
  giveCoins,
  takeCoins,
  transferCoins,
} from '../systems/Wallets';
import {
  gameCommandSchema,
  type Actor,
  type CommandContext,
  type CommandType,
  type GameCommand,
} from './schema';

/** What happened, so views can animate the right thing instead of diffing states. */
export type StateChange =
  | { kind: 'loaded' }
  | { kind: 'construction_started'; slotId: string }
  | { kind: 'days_advanced'; completedSlotIds: string[] }
  | { kind: 'building_forced'; slotId: string }
  | { kind: 'building_removed'; slotId: string }
  | { kind: 'resources_changed' }
  | { kind: 'npcs_changed' }
  | { kind: 'missions_changed' }
  /** `delivery` must still be filed in the depot (kept outside the state); null for materials. */
  | { kind: 'shop_purchased'; delivery: DepotDelivery | null };

export type CommandError =
  | ActionError
  | 'forbidden'
  | 'invalid_command'
  | 'blocked'
  /** Raised by the store when the stored game kept changing under a local change. */
  | 'conflict';

/** Every error, so answers from the server can be checked at runtime (the Record keeps it exhaustive). */
const COMMAND_ERRORS: Readonly<Record<CommandError, true>> = {
  empty_name: true,
  duplicate_name: true,
  duplicate_id: true,
  not_found: true,
  category_not_empty: true,
  insufficient_coins: true,
  nothing_to_move: true,
  nothing_changed: true,
  same_wallet: true,
  character_has_coins: true,
  no_home: true,
  home_full: true,
  no_housing: true,
  post_full: true,
  invalid_post: true,
  invalid_target: true,
  mission_closed: true,
  npc_unavailable: true,
  empty_reward: true,
  building_limit: true,
  material_already_listed: true,
  out_of_stock: true,
  not_for_sale: true,
  invalid_quantity: true,
  forbidden: true,
  invalid_command: true,
  blocked: true,
  conflict: true,
};

export function isCommandError(value: unknown): value is CommandError {
  return typeof value === 'string' && Object.hasOwn(COMMAND_ERRORS, value);
}

type Refusal = { ok: false; error: CommandError; reasons?: BlockReason[] };
type HandlerOutcome = { ok: true; state: GameState; change: StateChange } | Refusal;

export type CommandOutcome =
  | {
      ok: true;
      state: GameState;
      change: StateChange;
      /** Entries this command added, already stamped with its actor. */
      logged: LogEntry[];
    }
  /** `reasons` explains a `blocked` construction. */
  | Refusal;

/** How the log names the game master. */
export const MASTER_ACTOR = 'Mestre';

/** Everything else is a game master action. */
const PLAYER_COMMANDS: ReadonlySet<CommandType> = new Set([
  'build',
  'upgrade',
  'deposit',
  'npc_set_home',
  'npc_assign_job',
  'npc_unassign',
  'archive_log',
  'depot_log',
  'mission_create',
  'mission_update',
  'mission_remove',
  'mission_take_party',
  'mission_send_npcs',
  'set_image',
  'shop_buy',
  'shop_buy_materials',
  'shop_sell',
]);

/** Run by the server's join and unlink flows only (see `CommandContext.membership`). */
const MEMBERSHIP_COMMANDS: ReadonlySet<CommandType> = new Set([
  'character_join',
  'character_claim',
  'character_release',
]);

/**
 * The single entry point for changing the game: validates the untrusted
 * command, checks who may run it, then delegates to the pure systems. Pure,
 * so a server can run exactly the same rules the client does.
 */
export function applyCommand(
  state: GameState,
  catalog: Catalog,
  input: unknown,
  ctx: CommandContext,
): CommandOutcome {
  const parsed = gameCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_command' };
  const command = parsed.data;
  if (!isAllowed(command, ctx)) return { ok: false, error: 'forbidden' };
  const actor = actorName(state, ctx);
  const outcome = run(command.type, command, { state, catalog, actor, who: ctx.actor });
  if (!outcome.ok) return outcome;
  // A no-op keeps the very same state (and revision), so nothing needs saving.
  if (outcome.state === state) return { ...outcome, logged: [] };

  // Any change may leave NPCs in a home or post that no longer exists, or a mission without them.
  const settled = settleMissions(settleNpcs(outcome.state, catalog));
  const logged = settled.log
    .slice(state.log.length)
    .map((entry) => (actor ? { ...entry, actor } : entry));
  const log = trimLog([...state.log, ...logged]);
  const next = { ...settled, log, revision: state.revision + 1 };
  return { ok: true, state: next, change: outcome.change, logged };
}

/** Undefined for an anonymous player (offline, before logins exist). */
export function actorName(state: GameState, { actor }: CommandContext): string | undefined {
  if (actor.role === 'master') return MASTER_ACTOR;
  return state.characters.find((c) => c.id === actor.characterId)?.name;
}

/** Whether `ctx` may run `command` at all, before any rule looks at the game. */
export function isAllowed(command: GameCommand, { actor, membership }: CommandContext): boolean {
  if (MEMBERSHIP_COMMANDS.has(command.type)) return membership === true;
  if (actor.role === 'master') return true;
  if (!PLAYER_COMMANDS.has(command.type)) return false;
  // A player only acts for their own character: their coins, their photo.
  if (command.type === 'deposit') return command.characterId === actor.characterId;
  if (command.type === 'shop_buy') {
    return command.payer.kind === 'camp' || command.payer.characterId === actor.characterId;
  }
  if (command.type === 'set_image') {
    return command.target.kind === 'character' && command.target.id === actor.characterId;
  }
  return true;
}

type CommandOf = { [C in GameCommand as C['type']]: C };
interface World {
  state: GameState;
  catalog: Catalog;
  /** Who runs the command, as the log names them. */
  actor: string | undefined;
  /** Who runs it, for rules that depend on the role. */
  who: Actor;
}
type Handlers = { [K in CommandType]: (command: CommandOf[K], world: World) => HandlerOutcome };

function run<K extends CommandType>(type: K, command: CommandOf[K], world: World): HandlerOutcome {
  const handler: Handlers[K] = handlers[type];
  return handler(command, world);
}

const NOT_FOUND = { ok: false, error: 'not_found' } as const;

/** NPC edits: a no-op keeps the very same state as well. */
function npcs(outcome: Outcome): HandlerOutcome {
  if (!outcome.ok) return outcome;
  return { ok: true, state: outcome.state, change: { kind: 'npcs_changed' } };
}

function missions(outcome: Outcome): HandlerOutcome {
  if (!outcome.ok) return outcome;
  return { ok: true, state: outcome.state, change: { kind: 'missions_changed' } };
}

/** Resource edits: a no-op keeps the very same state, so the store can skip the save. */
function resources(outcome: Outcome): HandlerOutcome {
  if (!outcome.ok) return outcome;
  return { ok: true, state: outcome.state, change: { kind: 'resources_changed' } };
}

const handlers: Handlers = {
  build: ({ slotId, buildingId }, { state, catalog }) => {
    if (!findSlot(catalog, slotId) || !findBuilding(catalog, buildingId)) return NOT_FOUND;
    const result = startBuild(state, catalog, { slotId, buildingId });
    if (!result.ok) return { ok: false, error: 'blocked', reasons: result.reasons };
    return { ok: true, state: result.state, change: { kind: 'construction_started', slotId } };
  },
  upgrade: ({ slotId }, { state, catalog }) => {
    if (!state.slots[slotId]) return NOT_FOUND;
    const result = startUpgrade(state, catalog, slotId);
    if (!result.ok) return { ok: false, error: 'blocked', reasons: result.reasons };
    return { ok: true, state: result.state, change: { kind: 'construction_started', slotId } };
  },
  advance_days: ({ days }, { state, catalog }) => {
    const result = advanceDays(state, catalog, days);
    const change = { kind: 'days_advanced', completedSlotIds: result.completedSlotIds } as const;
    return { ok: true, state: result.state, change };
  },
  force_building: (order, { state, catalog }) => {
    const def = findBuilding(catalog, order.buildingId);
    if (!findSlot(catalog, order.slotId) || !def) return NOT_FOUND;
    if (order.level > def.levels.length) return { ok: false, error: 'invalid_command' };
    // Changing the level of a copy is fine; adding one past the limit is not.
    const isNewCopy = state.slots[order.slotId]?.buildingId !== def.id;
    if (isNewCopy && !hasRoomFor(state, def)) return { ok: false, error: 'building_limit' };
    const change = { kind: 'building_forced', slotId: order.slotId } as const;
    return { ok: true, state: forceBuilding(state, catalog, order), change };
  },
  remove_building: ({ slotId }, { state }) => {
    if (!state.slots[slotId]) return NOT_FOUND;
    return {
      ok: true,
      state: removeBuilding(state, slotId),
      change: { kind: 'building_removed', slotId },
    };
  },

  adjust_coins: ({ wallet, delta }, { state, catalog }) =>
    resources(adjustCoins(state, catalog, wallet, delta)),
  give_coins: ({ wallet, coins }, { state, catalog }) =>
    resources(giveCoins(state, catalog, wallet, coins)),
  take_coins: ({ wallet, coins }, { state, catalog }) =>
    resources(takeCoins(state, catalog, wallet, coins)),
  deposit: ({ characterId, coins }, { state }) =>
    resources(depositToCamp(state, characterId, coins)),
  transfer_coins: ({ from, to, coins }, { state }) =>
    resources(transferCoins(state, from, to, coins)),
  consolidate_wallet: ({ wallet }, { state, catalog }) =>
    resources(consolidateWallet(state, catalog, wallet)),

  add_material: (command, { state }) =>
    resources(
      addMaterial(state, {
        ...materialFields(command),
        id: command.id,
        quantity: command.quantity,
      }),
    ),
  update_material: (command, { state }) =>
    resources(updateMaterial(state, command.materialId, materialFields(command))),
  remove_material: ({ materialId }, { state }) => resources(removeMaterial(state, materialId)),
  adjust_material: ({ materialId, delta }, { state }) =>
    resources(adjustMaterial(state, materialId, delta)),
  add_material_category: ({ id, name }, { state }) =>
    resources(addMaterialCategory(state, { id, name })),
  rename_material_category: ({ categoryId, name }, { state }) =>
    resources(renameMaterialCategory(state, categoryId, name)),
  remove_material_category: ({ categoryId }, { state }) =>
    resources(removeMaterialCategory(state, categoryId)),

  add_research: ({ id, draft }, { state }) => resources(addResearch(state, id, draft)),
  update_research: ({ researchId, draft }, { state }) =>
    resources(updateResearch(state, researchId, draft)),
  complete_research: ({ researchId }, { state }) => resources(completeResearch(state, researchId)),
  remove_research: ({ researchId }, { state }) => resources(removeResearch(state, researchId)),
  add_research_category: ({ id, name }, { state }) =>
    resources(addResearchCategory(state, { id, name })),
  rename_research_category: ({ categoryId, name }, { state }) =>
    resources(renameResearchCategory(state, categoryId, name)),
  remove_research_category: ({ categoryId }, { state }) =>
    resources(removeResearchCategory(state, categoryId)),

  set_influence: ({ worldId, value }, { state, catalog }) =>
    resources(setWorldInfluence(state, catalog.worlds, { worldId, value })),

  add_character: (command, { state }) =>
    resources(addCharacter(state, { ...characterFields(command), id: command.id })),
  update_character: (command, { state }) =>
    resources(updateCharacter(state, command.characterId, characterFields(command))),
  remove_character: ({ characterId }, { state }) => resources(removeCharacter(state, characterId)),
  character_join: (command, { state }) =>
    resources(joinWithNewCharacter(state, { ...characterFields(command), id: command.id })),
  character_claim: ({ characterId }, { state }) =>
    resources(logPlayerChange(state, characterId, 'character_claimed')),
  character_release: ({ characterId }, { state }) =>
    resources(logPlayerChange(state, characterId, 'character_released')),

  npc_create: (command, { state, catalog }) =>
    npcs(addNpc(state, catalog, { ...npcFields(command), id: command.id })),
  npc_update: (command, { state, catalog }) =>
    npcs(
      updateNpc(state, catalog, command.npcId, { ...npcFields(command), status: command.status }),
    ),
  npc_remove: ({ npcId }, { state }) => npcs(removeNpc(state, npcId)),
  npc_set_home: ({ npcId, slotId }, { state, catalog }) =>
    npcs(setNpcHome(state, catalog, { npcId, slotId })),
  npc_assign_job: ({ npcId, slotId, activityId, researchId }, { state, catalog }) =>
    npcs(assignNpcJob(state, catalog, npcId, { slotId, activityId, researchId })),
  npc_unassign: ({ npcId }, { state }) => npcs(unassignNpc(state, npcId)),

  mission_create: (command, { state, catalog, actor }) =>
    missions(
      addMission(state, catalog, { ...missionFields(command), id: command.id, createdBy: actor }),
    ),
  mission_update: (command, { state, catalog }) =>
    missions(updateMission(state, catalog, command.missionId, missionFields(command))),
  mission_remove: ({ missionId }, { state }) => missions(removeMission(state, missionId)),
  mission_take_party: ({ missionId }, { state }) => missions(takeMissionAsParty(state, missionId)),
  mission_send_npcs: ({ missionId, npcIds }, { state, catalog }) =>
    missions(sendNpcsOnMission(state, catalog, { missionId, npcIds })),
  mission_resolve: ({ missionId, result, injuredNpcIds }, { state, catalog }) =>
    missions(resolveMission(state, catalog, { missionId, result, injuredNpcIds })),

  shop_item_create: ({ id, item }, { state }) => resources(addShopItem(state, { ...item, id })),
  shop_item_update: ({ itemId, item }, { state }) => resources(updateShopItem(state, itemId, item)),
  shop_item_remove: ({ itemId }, { state }) => resources(removeShopItem(state, itemId)),
  shop_set_promotion: ({ itemId, discountPercent }, { state }) =>
    resources(setShopPromotion(state, itemId, discountPercent)),

  shop_buy: ({ itemId, quantity, payer, deliveryId }, { state, catalog, who }) => {
    const result = buyFromShop(state, catalog, { itemId, quantity, payer, deliveryId }, who);
    if (!result.ok) return result;
    return {
      ok: true,
      state: result.state,
      change: { kind: 'shop_purchased', delivery: result.delivery },
    };
  },

  shop_buy_materials: ({ lines }, { state, catalog, who }) =>
    resources(buyMaterials(state, catalog, lines, who)),
  shop_sell: ({ materialId, quantity }, { state, catalog, who }) =>
    resources(sellToShop(state, catalog, { materialId, quantity }, who)),

  set_image: ({ target, image }, { state, catalog }) => {
    // An uploaded photo only fits the record whose folder holds it (the Storage policies look at it).
    if (looksLikeUpload(image) && !isUploadFor(image, target)) {
      return { ok: false, error: 'invalid_command' };
    }
    return resources(setImage(state, catalog, target, image));
  },

  archive_log: ({ change }, { state }) =>
    resources(ok(withLog(state, { day: state.day, kind: 'archive_changed', change }))),

  depot_log: ({ change }, { state }) =>
    resources(ok(withLog(state, { day: state.day, kind: 'depot_changed', change }))),
};

function materialFields({ name, category, icon, description }: MaterialFields): MaterialFields {
  return { name, category, icon, description };
}

function npcFields({
  name,
  title,
  portrait,
  description,
  skills,
  attributes,
  wage,
  sprite,
}: NpcFields): NpcFields {
  return { name, title, portrait, description, skills, attributes, wage, sprite };
}

function missionFields({
  title,
  requester,
  location,
  description,
  reward,
  days,
  difficulty,
}: MissionFields): MissionFields {
  return { title, requester, location, description, reward, days, difficulty };
}

function characterFields({ name, color, portrait }: CharacterFields): CharacterFields {
  return { name, color, portrait };
}
