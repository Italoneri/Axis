import { describe, expect, it } from 'vitest';
import { consolidate, fromBronze, goldToBronze, pay, toBronze, type CoinBag } from './Coins';
import { testCatalog } from './testFixtures';

const { currencies } = testCatalog;

describe('toBronze', () => {
  it.each<{ bag: CoinBag; bronze: number }>([
    { bag: {}, bronze: 0 },
    { bag: { emerald: 1 }, bronze: 10000 },
    { bag: { platinum: 3, gold: 12, silver: 4, bronze: 7 }, bronze: 4247 },
    { bag: { ruby: 9 }, bronze: 0 },
  ])('values $bag as $bronze bronze', ({ bag, bronze }) => {
    expect(toBronze(bag, currencies)).toBe(bronze);
  });
});

describe('goldToBronze', () => {
  it.each([
    { gold: 150, bronze: 15000 },
    { gold: 0.1, bronze: 10 },
    { gold: 1234.56, bronze: 123456 },
  ])('converts $gold PO to $bronze bronze without float noise', ({ gold, bronze }) => {
    expect(goldToBronze(gold, 100)).toBe(bronze);
  });
});

describe('fromBronze', () => {
  it.each<{ bronze: number; bag: CoinBag }>([
    { bronze: 0, bag: {} },
    { bronze: 100, bag: { gold: 1 } },
    { bronze: 4247, bag: { platinum: 4, gold: 2, silver: 4, bronze: 7 } },
  ])('splits $bronze bronze into $bag', ({ bronze, bag }) => {
    expect(fromBronze(bronze, currencies)).toEqual(bag);
  });

  it.each([0, 1, 99, 100, 101, 55450, 1_110_747_450])(
    'round-trips %i bronze through coins',
    (bronze) => {
      expect(toBronze(fromBronze(bronze, currencies), currencies)).toBe(bronze);
    },
  );
});

describe('gold and emerald units', () => {
  it('values an emerald at 100 gold, so 111111 emeralds are 11.111.100 PO', () => {
    expect(toBronze({ emerald: 111111 }, currencies)).toBe(goldToBronze(11_111_100, 100));
    expect(toBronze({ gold: 111111 }, currencies)).toBe(goldToBronze(111111, 100));
  });
});

describe('consolidate', () => {
  it('trades small coins for the biggest ones, keeping the value', () => {
    expect(consolidate({ bronze: 1234, silver: 25, gold: 9 }, currencies)).toEqual({
      platinum: 2,
      gold: 3,
      silver: 8,
      bronze: 4,
    });
  });

  it('leaves an already consolidated wallet as it is', () => {
    expect(fromBronze(toBronze({ emerald: 2, gold: 3 }, currencies), currencies)).toEqual({
      emerald: 2,
      gold: 3,
    });
  });
});

describe('pay', () => {
  it.each<{ name: string; wallet: CoinBag; cost: number; left: CoinBag }>([
    { name: 'exact coins', wallet: { gold: 2, silver: 5 }, cost: 250, left: {} },
    {
      name: 'smallest coins first',
      wallet: { bronze: 30, silver: 10, gold: 5 },
      cost: 120,
      left: { silver: 1, gold: 5 },
    },
    {
      name: 'change from a broken coin',
      wallet: { platinum: 1 },
      cost: 250,
      left: { gold: 7, silver: 5 },
    },
    {
      name: 'small coins plus change',
      wallet: { bronze: 3, silver: 1, gold: 1 },
      cost: 15,
      left: { silver: 9, bronze: 8 },
    },
    {
      name: 'breaking the smallest coin that covers the rest',
      wallet: { gold: 1, emerald: 1 },
      cost: 50,
      left: { emerald: 1, silver: 5 },
    },
    { name: 'a free structure', wallet: { gold: 1 }, cost: 0, left: { gold: 1 } },
  ])('pays $name', ({ wallet, cost, left }) => {
    const result = pay(wallet, cost, currencies);
    expect(result).toEqual({ ok: true, wallet: left });
    if (result.ok)
      expect(toBronze(result.wallet, currencies)).toBe(toBronze(wallet, currencies) - cost);
  });

  it('refuses when the balance is short, saying by how much', () => {
    expect(pay({ gold: 1, silver: 2 }, 200, currencies)).toEqual({ ok: false, missingBronze: 80 });
  });

  it('always keeps the value exact', () => {
    const wallet = { emerald: 1, platinum: 2, gold: 3, silver: 4, bronze: 5 };
    const total = toBronze(wallet, currencies);
    for (let cost = 0; cost <= total; cost += 97) {
      const result = pay(wallet, cost, currencies);
      if (!result.ok) throw new Error(`could not pay ${cost}`);
      expect(toBronze(result.wallet, currencies)).toBe(total - cost);
    }
  });
});
