import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildFunctionBundle } from './build-functions';

// Same bundle, same commands, two runtimes: the Edge Function (Deno) must reach
// exactly the state the game (Node/browser) reaches.

const script = fileURLToPath(new URL('./parity.mjs', import.meta.url));
/** The deno devDependency's launcher: runs the right binary on every OS, no shell needed. */
const denoLauncher = createRequire(import.meta.url).resolve('deno/bin.cjs');
const TIMEOUT_MS = 60_000;

function runNode(args: string[]): string {
  return execFileSync(process.execPath, args, { encoding: 'utf8', timeout: TIMEOUT_MS }).trim();
}

const digest = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 12);

await buildFunctionBundle();
const node = runNode([script]);
const deno = runNode([denoLauncher, 'run', '--allow-read', script]);
console.log(`[parity] node ${digest(node)} · deno ${digest(deno)}`);
if (node !== deno) {
  console.error('[parity] outputs differ');
  process.exit(1);
}
