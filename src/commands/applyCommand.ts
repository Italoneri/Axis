import { findBuilding, findSlot, type Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { startBuild, startUpgrade, type BlockReason } from '../systems/BuildSystem';
import {
  addCharacter,
  removeCharacter,
  updateCharacter,
  type CharacterFields,
} from '../systems/Characters';
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
import type { ActionError, Outcome } from '../systems/outcome';
import {
  addResearch,
  addResearchCategory,
  completeResearch,
  removeResearch,
  removeResearchCategory,
  renameResearchCategory,
  updateResearch,
} from '../systems/Research';
import { advanceDays } from '../systems/TimeSystem';
import { adjustCoins, consolidateWallet, depositToCamp, transferCoins } from '../systems/Wallets';
import {
  gameCommandSchema,
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
  | { kind: 'resources_changed' };

export type CommandError =
  | ActionError
  | 'forbidden'
  | 'invalid_command'
  | 'blocked'
  /** Raised by the store when the stored game kept changing under a local change. */
  | 'conflict';

export type CommandOutcome =
  | { ok: true; state: GameState; change: StateChange }
  /** `reasons` explains a `blocked` construction. */
  | { ok: false; error: CommandError; reasons?: BlockReason[] };

/** Everything else is a game master action. */
const PLAYER_COMMANDS: ReadonlySet<CommandType> = new Set(['build', 'upgrade', 'deposit']);

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
  const outcome = run(command.type, command, { state, catalog });
  // A no-op keeps the very same state (and revision), so nothing needs saving.
  if (!outcome.ok || outcome.state === state) return outcome;
  return { ...outcome, state: { ...outcome.state, revision: state.revision + 1 } };
}

function isAllowed(command: GameCommand, { actor }: CommandContext): boolean {
  if (actor.role === 'master') return true;
  if (!PLAYER_COMMANDS.has(command.type)) return false;
  return command.type !== 'deposit' || command.characterId === actor.characterId;
}

type CommandOf = { [C in GameCommand as C['type']]: C };
interface World {
  state: GameState;
  catalog: Catalog;
}
type Handlers = { [K in CommandType]: (command: CommandOf[K], world: World) => CommandOutcome };

function run<K extends CommandType>(type: K, command: CommandOf[K], world: World): CommandOutcome {
  const handler: Handlers[K] = handlers[type];
  return handler(command, world);
}

const NOT_FOUND = { ok: false, error: 'not_found' } as const;

/** Resource edits: a no-op keeps the very same state, so the store can skip the save. */
function resources(outcome: Outcome): CommandOutcome {
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
  advance_days: ({ days }, { state }) => {
    const result = advanceDays(state, days);
    const change = { kind: 'days_advanced', completedSlotIds: result.completedSlotIds } as const;
    return { ok: true, state: result.state, change };
  },
  force_building: (order, { state, catalog }) => {
    const def = findBuilding(catalog, order.buildingId);
    if (!findSlot(catalog, order.slotId) || !def) return NOT_FOUND;
    if (order.level > def.levels.length) return { ok: false, error: 'invalid_command' };
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

  adjust_coins: ({ wallet, delta }, { state }) => resources(adjustCoins(state, wallet, delta)),
  deposit: ({ characterId, coins }, { state }) =>
    resources(depositToCamp(state, characterId, coins)),
  transfer_coins: ({ from, to, coins }, { state }) =>
    resources(transferCoins(state, from, to, coins)),
  consolidate_wallet: ({ wallet }, { state, catalog }) =>
    resources(consolidateWallet(state, catalog, wallet)),

  add_material: (command, { state }) =>
    resources(addMaterial(state, { ...materialFields(command), quantity: command.quantity })),
  update_material: (command, { state }) =>
    resources(updateMaterial(state, command.materialId, materialFields(command))),
  remove_material: ({ materialId }, { state }) => resources(removeMaterial(state, materialId)),
  adjust_material: ({ materialId, delta }, { state }) =>
    resources(adjustMaterial(state, materialId, delta)),
  add_material_category: ({ name }, { state }) => resources(addMaterialCategory(state, name)),
  rename_material_category: ({ categoryId, name }, { state }) =>
    resources(renameMaterialCategory(state, categoryId, name)),
  remove_material_category: ({ categoryId }, { state }) =>
    resources(removeMaterialCategory(state, categoryId)),

  add_research: ({ draft }, { state }) => resources(addResearch(state, draft)),
  update_research: ({ researchId, draft }, { state }) =>
    resources(updateResearch(state, researchId, draft)),
  complete_research: ({ researchId }, { state }) => resources(completeResearch(state, researchId)),
  remove_research: ({ researchId }, { state }) => resources(removeResearch(state, researchId)),
  add_research_category: ({ name }, { state }) => resources(addResearchCategory(state, name)),
  rename_research_category: ({ categoryId, name }, { state }) =>
    resources(renameResearchCategory(state, categoryId, name)),
  remove_research_category: ({ categoryId }, { state }) =>
    resources(removeResearchCategory(state, categoryId)),

  set_influence: ({ worldId, value }, { state, catalog }) =>
    resources(setWorldInfluence(state, catalog.worlds, { worldId, value })),

  add_character: (command, { state }) => resources(addCharacter(state, characterFields(command))),
  update_character: (command, { state }) =>
    resources(updateCharacter(state, command.characterId, characterFields(command))),
  remove_character: ({ characterId }, { state }) => resources(removeCharacter(state, characterId)),
};

function materialFields({ name, category, icon, description }: MaterialFields): MaterialFields {
  return { name, category, icon, description };
}

function characterFields({ name, color, portrait }: CharacterFields): CharacterFields {
  return { name, color, portrait };
}
