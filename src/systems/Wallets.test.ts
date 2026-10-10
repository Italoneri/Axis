import { describe, expect, it } from 'vitest';
import {
  adjustCoins,
  CAMP,
  campShortfall,
  consolidateWallet,
  depositToCamp,
  groupBronze,
  transferCoins,
} from './Wallets';
import { makeState, testCatalog } from './testFixtures';

const thorin = { kind: 'character', characterId: 'thorin' } as const;

describe('depositToCamp', () => {
  it('moves the same coins from the character to the Acampamento and logs it', () => {
    const result = depositToCamp(makeState({ day: 14 }), 'thorin', { gold: 3 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets).toEqual({
      camp: { gold: 103 },
      characters: { thorin: { gold: 2 } },
    });
    expect(result.state.log).toEqual([
      { day: 14, kind: 'coins_deposited', character: 'Thorin', coins: { gold: 3 } },
    ]);
  });

  it.each([
    { name: 'more than the character has', coins: { gold: 6 }, error: 'insufficient_coins' },
    { name: 'a coin the character lacks', coins: { platinum: 1 }, error: 'insufficient_coins' },
    { name: 'nothing', coins: {}, error: 'nothing_to_move' },
  ])('refuses to deposit $name', ({ coins, error }) => {
    expect(depositToCamp(makeState(), 'thorin', coins)).toEqual({ ok: false, error });
  });

  it('refuses an unknown character', () => {
    expect(depositToCamp(makeState(), 'ghost', { gold: 1 })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });
});

describe('transferCoins', () => {
  it('lets the master take coins out of the Acampamento', () => {
    const result = transferCoins(makeState(), CAMP, thorin, { gold: 40 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets).toEqual({
      camp: { gold: 60 },
      characters: { thorin: { gold: 45 } },
    });
    expect(result.state.log.at(-1)).toEqual({
      day: 1,
      kind: 'coins_transferred',
      from: undefined,
      to: 'Thorin',
      coins: { gold: 40 },
    });
  });

  it('refuses moving into the same wallet or beyond the balance', () => {
    expect(transferCoins(makeState(), CAMP, CAMP, { gold: 1 })).toEqual({
      ok: false,
      error: 'same_wallet',
    });
    expect(transferCoins(makeState(), thorin, CAMP, { gold: 50 })).toEqual({
      ok: false,
      error: 'insufficient_coins',
    });
  });
});

describe('adjustCoins', () => {
  it('gives and takes coins without going below zero, logging what changed', () => {
    const result = adjustCoins(makeState(), thorin, { gold: -10, silver: 4 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets.characters['thorin']).toEqual({ silver: 4 });
    expect(result.state.log.at(-1)).toMatchObject({
      wallet: 'Thorin',
      delta: { gold: -5, silver: 4 },
    });
  });

  it('returns the same state when nothing changes', () => {
    const state = makeState();
    expect(adjustCoins(state, thorin, { platinum: -1 })).toEqual({ ok: true, state });
  });
});

describe('consolidateWallet', () => {
  it('swaps small coins for bigger ones', () => {
    const state = makeState({
      wallets: { camp: { bronze: 150, silver: 15 }, characters: { thorin: {} } },
    });
    const result = consolidateWallet(state, testCatalog, CAMP);
    expect(result.ok && result.state.wallets.camp).toEqual({ gold: 3 });
  });
});

describe('campShortfall and groupBronze', () => {
  it('report what is missing in the Acampamento and what the characters hold', () => {
    const state = makeState();
    expect(campShortfall(state, testCatalog, 10000)).toBeNull();
    expect(campShortfall(state, testCatalog, 22000)).toEqual({
      missingBronze: 12000,
      personalBronze: 500,
    });
    expect(groupBronze(state, testCatalog)).toBe(10500);
  });
});
