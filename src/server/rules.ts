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

const SAMPLE: readonly GameCommand[] = [
  { type: 'advance_days', days: 3 },
  { type: 'add_material_category', id: 'matcat_parity', name: 'Paridade' },
  { type: 'adjust_coins', wallet: { kind: 'camp' }, delta: { gold: 7 } },
];

/**
 * Runs a fixed list of commands on a fresh game and returns the final state as
 * JSON. `npm run parity` compares its output in Node and in Deno.
 */
export function paritySample(): string {
  const ctx = { actor: { role: 'master' } } as const;
  const final = SAMPLE.reduce((state, command) => {
    const outcome = applyCommand(state, serverCatalog, command, ctx);
    if (!outcome.ok) throw new Error(`parity sample: ${command.type} refused (${outcome.error})`);
    return outcome.state;
  }, createInitialState(serverCatalog));
  return JSON.stringify(final);
}
