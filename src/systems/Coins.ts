import type { AmountBag, CurrencyDef } from '../model/schema';

// Coin math. Wallets keep a count per currency (the players hold physical coins),
// and every calculation runs on integers in the smallest unit, bronze.

export type CoinBag = AmountBag;

export type Payment = { ok: true; wallet: CoinBag } | { ok: false; missingBronze: number };

export function toBronze(bag: CoinBag, currencies: readonly CurrencyDef[]): number {
  return currencies.reduce((sum, c) => sum + (bag[c.id] ?? 0) * c.bronzeValue, 0);
}

/** Costs are written in gold; rounding absorbs float noise like 0.1 * 100. */
export function goldToBronze(gold: number, goldValue: number): number {
  return Math.round(gold * goldValue);
}

/** Fewest coins worth exactly `bronze`, biggest coins first. */
export function fromBronze(bronze: number, currencies: readonly CurrencyDef[]): CoinBag {
  const descending = [...currencies].sort((a, b) => b.bronzeValue - a.bronzeValue);
  const { bag } = descending.reduce(
    ({ bag, rest }, c) => {
      const count = Math.floor(rest / c.bronzeValue);
      return { bag: withCount(bag, c.id, count), rest: rest - count * c.bronzeValue };
    },
    { bag: {} as CoinBag, rest: bronze },
  );
  return bag;
}

/** Trades the smaller coins for the biggest ones possible, keeping the same value. */
export function consolidate(bag: CoinBag, currencies: readonly CurrencyDef[]): CoinBag {
  return fromBronze(toBronze(bag, currencies), currencies);
}

export function addCoins(a: CoinBag, b: CoinBag): CoinBag {
  return Object.entries(b).reduce((bag, [id, n]) => withCount(bag, id, (bag[id] ?? 0) + n), a);
}

/** Caller must check `hasCoins` first. */
export function removeCoins(a: CoinBag, b: CoinBag): CoinBag {
  return Object.entries(b).reduce(
    (bag, [id, n]) => withCount(bag, id, Math.max(0, (bag[id] ?? 0) - n)),
    a,
  );
}

/** Whether the wallet holds at least these coins, denomination by denomination. */
export function hasCoins(wallet: CoinBag, coins: CoinBag): boolean {
  return Object.entries(coins).every(([id, n]) => (wallet[id] ?? 0) >= n);
}

export function isEmptyBag(bag: CoinBag): boolean {
  return Object.values(bag).every((n) => n === 0);
}

/**
 * Pays `costBronze` spending the smallest coins first. When they cannot cover the
 * rest exactly, it breaks the smallest coin that does and takes the change back
 * in smaller coins.
 */
export function pay(
  wallet: CoinBag,
  costBronze: number,
  currencies: readonly CurrencyDef[],
): Payment {
  const available = toBronze(wallet, currencies);
  if (available < costBronze) return { ok: false, missingBronze: costBronze - available };

  const ascending = [...currencies].sort((a, b) => a.bronzeValue - b.bronzeValue);
  const { spent, rest } = ascending.reduce(
    ({ spent, rest }, c) => {
      const count = Math.min(wallet[c.id] ?? 0, Math.floor(rest / c.bronzeValue));
      return { spent: withCount(spent, c.id, count), rest: rest - count * c.bronzeValue };
    },
    { spent: {} as CoinBag, rest: costBronze },
  );
  const afterSpending = removeCoins(wallet, spent);
  if (rest === 0) return { ok: true, wallet: afterSpending };

  // Any coin left over is worth more than `rest`, so the smallest one covers it.
  const broken = ascending.find((c) => (afterSpending[c.id] ?? 0) > 0 && c.bronzeValue >= rest);
  if (!broken) throw new Error(`pay: no coin covers ${rest} bronze despite enough balance`);
  const change = fromBronze(broken.bronzeValue - rest, currencies);
  return { ok: true, wallet: addCoins(removeCoins(afterSpending, { [broken.id]: 1 }), change) };
}

/** Keeps bags sparse so saves only list the coins actually held. */
function withCount(bag: CoinBag, id: string, count: number): CoinBag {
  if (count > 0) return { ...bag, [id]: count };
  if (!(id in bag)) return bag;
  return Object.fromEntries(Object.entries(bag).filter(([key]) => key !== id));
}
