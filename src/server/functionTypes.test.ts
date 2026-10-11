import { describe, expect, it } from 'vitest';
import type * as Declared from '../../supabase/functions/_shared/game';
import { serveGame } from './http';
import { paritySample } from './rules';

// Type-level check (run by `tsc`): the hand-written game.d.ts Deno reads must
// accept what src/server actually exports.
const declared: {
  serveGame: typeof Declared.serveGame;
  paritySample: typeof Declared.paritySample;
} = { serveGame, paritySample };

describe('game.d.ts', () => {
  it('matches the bundle entry exports', () => {
    expect(Object.keys(declared)).toEqual(['serveGame', 'paritySample']);
  });
});
