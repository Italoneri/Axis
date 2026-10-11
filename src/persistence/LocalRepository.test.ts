import { describe, expect, it } from 'vitest';
import type { CommandContext } from '../commands/schema';
import { makeState, memoryStorage, testCatalog } from '../systems/testFixtures';
import { LocalRepository } from './LocalRepository';

const master: CommandContext = { actor: { role: 'master' } };
const player: CommandContext = { actor: { role: 'player', characterId: 'thorin' } };
const advance = { kind: 'command', command: { type: 'advance_days', days: 1 } } as const;

function repository() {
  return new LocalRepository(memoryStorage(), testCatalog);
}

describe('LocalRepository', () => {
  it('applies a command to the stored game and keeps it', async () => {
    const repo = repository();
    const result = await repo.submit({ ...advance, ctx: master }, 0);
    expect(result).toMatchObject({ ok: true, state: { day: 2, revision: 1 } });
    expect(await repo.load()).toMatchObject({ day: 2, revision: 1 });
  });

  it('refuses what the rules refuse, without storing anything', async () => {
    const repo = repository();
    expect(await repo.submit({ ...advance, ctx: player }, 0)).toEqual({
      ok: false,
      reason: 'refused',
      error: 'forbidden',
    });
    expect((await repo.load()).revision).toBe(0);
  });

  it('reports a conflict when the stored revision moved on', async () => {
    const repo = repository();
    await repo.submit({ ...advance, ctx: master }, 0);
    expect(await repo.submit({ ...advance, ctx: master }, 0)).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('restores an imported save as the next revision', async () => {
    const repo = repository();
    const result = await repo.submit({ kind: 'restore', state: makeState({ day: 9 }) }, 0);
    expect(result).toEqual({ ok: true, state: makeState({ day: 9, revision: 1 }) });
  });
});
