import { describe, expect, it } from 'vitest';
import { toBronze } from './Coins';
import {
  adjustCoins,
  CAMP,
  campShortfall,
  consolidateWallet,
  depositToCamp,
  giveCoins,
  groupBronze,
  takeCoins,
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

describe('takeCoins', () => {
  const withCamp = (camp: Record<string, number>) =>
    makeState({ day: 9, wallets: { camp, characters: { thorin: {} } } });
  const campBronze = (state: ReturnType<typeof makeState>) =>
    toBronze(state.wallets.camp, testCatalog.currencies);

  it('removes 5 Ouro + 50 Prata (10 PO) from a wallet of emeralds and platinum, with change', () => {
    const state = withCamp({ emerald: 1, platinum: 2 });
    const result = takeCoins(state, testCatalog, CAMP, { gold: 5, silver: 50 });
    if (!result.ok) throw new Error(result.error);
    expect(campBronze(result.state)).toBe(campBronze(state) - 1000);
    expect(result.state.wallets.camp).toEqual({ emerald: 1, platinum: 1 });
  });

  it('breaks the smallest coin that covers the rest and gives the change back', () => {
    const state = withCamp({ emerald: 1 });
    const result = takeCoins(state, testCatalog, CAMP, { gold: 5, silver: 50 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets.camp).toEqual({ platinum: 9 });
    expect(result.state.log.at(-1)).toEqual({
      day: 9,
      kind: 'coins_adjusted',
      delta: { emerald: -1, platinum: 9 },
      valueBronze: -1000,
    });
  });

  it('spends the exact coins when the wallet has them, without needless change', () => {
    const state = withCamp({ platinum: 3, gold: 5, silver: 50 });
    const result = takeCoins(state, testCatalog, CAMP, { gold: 5, silver: 50 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets.camp).toEqual({ platinum: 3 });
    expect(result.state.log.at(-1)).toMatchObject({ delta: { gold: -5, silver: -50 } });
  });

  it('refuses more than the wallet is worth and leaves the state alone', () => {
    const state = withCamp({ gold: 9, silver: 9 });
    expect(takeCoins(state, testCatalog, CAMP, { gold: 10 })).toEqual({
      ok: false,
      error: 'insufficient_coins',
    });
  });

  it('refuses an empty amount instead of doing nothing silently', () => {
    expect(takeCoins(withCamp({ gold: 1 }), testCatalog, CAMP, {})).toEqual({
      ok: false,
      error: 'nothing_to_move',
    });
  });
});

describe('giveCoins', () => {
  it('adds the same coins and logs the value', () => {
    const result = giveCoins(makeState({ day: 3 }), testCatalog, thorin, { gold: 2, silver: 4 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.wallets.characters['thorin']).toEqual({ gold: 7, silver: 4 });
    expect(result.state.log.at(-1)).toEqual({
      day: 3,
      kind: 'coins_adjusted',
      wallet: 'Thorin',
      delta: { gold: 2, silver: 4 },
      valueBronze: 240,
    });
  });
});

describe('adjustCoins (pages opened before take_coins)', () => {
  it('gives a delta that only adds', () => {
    const result = adjustCoins(makeState(), testCatalog, thorin, { gold: 1 });
    expect(result.ok && result.state.wallets.characters['thorin']).toEqual({ gold: 6 });
  });

  it('takes the whole value of a delta that only removes, with change', () => {
    const state = makeState({ wallets: { camp: { platinum: 1 }, characters: { thorin: {} } } });
    const result = adjustCoins(state, testCatalog, CAMP, { gold: -5, silver: -50 });
    expect(result.ok && result.state.wallets.camp).toEqual({});
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
