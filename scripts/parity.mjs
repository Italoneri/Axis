// Prints the parity sample computed by the Edge Function bundle. Runs unchanged
// in Node and in Deno; scripts/check-parity.ts compares both outputs.
import { paritySample } from '../supabase/functions/_shared/game.js';

console.log(paritySample());
