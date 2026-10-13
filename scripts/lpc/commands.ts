import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { GENERATOR_DIR, ROOT } from './paths';

const COMMAND_TIMEOUT_MS = 15 * 60_000;

function run(command: string, args: readonly string[], options: SpawnSyncOptions): void {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    timeout: COMMAND_TIMEOUT_MS,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${result.status}`);
}

/** git inside the generator clone. */
export function git(args: readonly string[]): void {
  const inClone = args[0] === 'clone' ? ROOT : GENERATOR_DIR;
  run('git', args, { cwd: inClone });
}

/** npm through the same npm that runs this script, so Windows needs no shell. */
export function npm(args: readonly string[], cwd: string): void {
  const npmCli = process.env.npm_execpath;
  if (npmCli === undefined) throw new Error('run this through npm (npm run lpc:...)');
  run(process.execPath, [npmCli, ...args], { cwd });
}
