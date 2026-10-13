import { applyCommand } from '../commands/applyCommand';
import type { GameCommand } from '../commands/schema';
import { createInitialState } from '../systems/SaveSystem';
import { serverCatalog } from './catalog';

// Entry point of the Edge Function bundle (scripts/build-functions.ts): everything
// the server runs comes from here, so Node (Vitest) and Deno run the same code.

export { applyCommand } from '../commands/applyCommand';
export { parseSave, createInitialState } from '../systems/SaveSystem';
export { serverCatalog } from './catalog';
export { serveGame } from './http';

const PARITY_MISSION = {
  title: 'Caçada exótica',
  requester: 'Rizzelena',
  location: 'Taverna Pombo de Ouro',
  description: 'Uma **guivra** no rio.',
  reward: { gold: 2, silver: 3 },
  days: 2,
  difficulty: 'media',
} as const;

const SAMPLE: readonly GameCommand[] = [
  { type: 'advance_days', days: 3 },
  { type: 'add_material_category', id: 'matcat_parity', name: 'Paridade' },
  { type: 'adjust_coins', wallet: { kind: 'camp' }, delta: { gold: 7 } },
  { type: 'force_building', slotId: 'outer_1', buildingId: 'barracks', level: 1 },
  { type: 'force_building', slotId: 'outer_2', buildingId: 'forge', level: 2 },
  {
    type: 'npc_create',
    id: 'npc_parity',
    name: 'Bianca',
    title: 'Maga',
    description: '',
    skills: { smithing: 13 },
    wage: 0.35,
  },
  { type: 'npc_set_home', npcId: 'npc_parity', slotId: 'outer_1' },
  {
    type: 'set_image',
    target: { kind: 'npc', id: 'npc_parity' },
    image: 'upload:npc/npc_parity/img_parity.webp',
  },
  { type: 'set_image', target: { kind: 'world', id: 'elves' }, image: 'icon.influence' },
  { type: 'npc_assign_job', npcId: 'npc_parity', slotId: 'outer_2', activityId: 'forjar' },
  {
    type: 'npc_create',
    id: 'npc_parity_clumsy',
    name: 'Tobias',
    title: 'Aprendiz',
    description: '',
    skills: { smithing: -7 },
    attributes: { strength: 13, dexterity: 7, magic: -2 },
  },
  { type: 'npc_set_home', npcId: 'npc_parity_clumsy', slotId: 'outer_1' },
  { type: 'npc_assign_job', npcId: 'npc_parity_clumsy', slotId: 'outer_2', activityId: 'forjar' },
  { type: 'force_building', slotId: 'outer_3', buildingId: 'guild', level: 2 },
  { type: 'mission_create', id: 'mission_parity', ...PARITY_MISSION },
  { type: 'mission_create', id: 'mission_parity_party', ...PARITY_MISSION, title: 'Escolta' },
  { type: 'mission_send_npcs', missionId: 'mission_parity', npcIds: ['npc_parity_clumsy'] },
  { type: 'mission_take_party', missionId: 'mission_parity_party' },
  { type: 'advance_days', days: 5 },
  { type: 'mission_resolve', missionId: 'mission_parity', result: 'sucesso', injuredNpcIds: [] },
  {
    type: 'mission_resolve',
    missionId: 'mission_parity_party',
    result: 'sucesso',
    injuredNpcIds: [],
  },
];

/** Run the way the game function links and unlinks players. */
const MEMBERSHIP_SAMPLE: readonly GameCommand[] = [
  { type: 'character_join', id: 'char_parity', name: 'Paridade', color: '#336699' },
  { type: 'character_release', characterId: 'char_parity' },
  { type: 'character_claim', characterId: 'char_parity' },
];

/**
 * Runs a fixed list of commands on a fresh game and returns the final state as
 * JSON. `npm run parity` compares its output in Node and in Deno.
 */
export function paritySample(): string {
  const master = { actor: { role: 'master' } } as const;
  const joining = {
    actor: { role: 'player', characterId: 'char_parity' },
    membership: true,
  } as const;
  const steps = [
    ...SAMPLE.map((command) => ({ command, ctx: master })),
    ...MEMBERSHIP_SAMPLE.map((command) => ({ command, ctx: joining })),
  ];
  const final = steps.reduce((state, { command, ctx }) => {
    const outcome = applyCommand(state, serverCatalog, command, ctx);
    if (!outcome.ok) throw new Error(`parity sample: ${command.type} refused (${outcome.error})`);
    return outcome.state;
  }, createInitialState(serverCatalog));
  return JSON.stringify(final);
}
