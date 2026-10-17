import type { Catalog } from '../model/catalog';
import type { AmountBag, GameState } from '../model/schema';
import {
  addCoins,
  consolidate,
  hasCoins,
  isEmptyBag,
  pay,
  removeCoins,
  toBronze,
  type CoinBag,
} from './Coins';
import { fail, ok, withLog, type Outcome } from './outcome';

// Group wallets: one per character plus the Acampamento. Only the Acampamento
// pays for structures; characters deposit into it, and only the master moves
// coins back out.

export type WalletRef = { kind: 'camp' } | { kind: 'character'; characterId: string };

export const CAMP: WalletRef = { kind: 'camp' };

export interface CoinShortfall {
  missingBronze: number;
  /** What the characters hold, so players know whether a deposit would cover it. */
  personalBronze: number;
}

export function walletOf(state: GameState, ref: WalletRef): CoinBag | undefined {
  return ref.kind === 'camp' ? state.wallets.camp : state.wallets.characters[ref.characterId];
}

export function personalBronze(state: GameState, catalog: Catalog): number {
  return Object.values(state.wallets.characters).reduce(
    (sum, wallet) => sum + toBronze(wallet, catalog.currencies),
    0,
  );
}

/** Acampamento plus every character: informational only, it cannot be spent as a whole. */
export function groupBronze(state: GameState, catalog: Catalog): number {
  return toBronze(state.wallets.camp, catalog.currencies) + personalBronze(state, catalog);
}

export function campShortfall(
  state: GameState,
  catalog: Catalog,
  costBronze: number,
): CoinShortfall | null {
  const missingBronze = costBronze - toBronze(state.wallets.camp, catalog.currencies);
  if (missingBronze <= 0) return null;
  return { missingBronze, personalBronze: personalBronze(state, catalog) };
}

/**
 * Master's "Ajustar" in the format clients sent before `take_coins`: a delta
 * that only adds gives those coins, one that only removes takes its whole
 * value (`takeCoins`). Mixed signs never pass the command schema.
 */
export function adjustCoins(
  state: GameState,
  catalog: Catalog,
  ref: WalletRef,
  delta: AmountBag,
): Outcome {
  const isTaking = Object.values(delta).some((amount) => amount < 0);
  if (!isTaking) return giveCoins(state, catalog, ref, delta);
  const taken = Object.fromEntries(Object.entries(delta).map(([id, n]) => [id, -n]));
  return takeCoins(state, catalog, ref, taken);
}

/** Master: adds these coins to the wallet. */
export function giveCoins(
  state: GameState,
  catalog: Catalog,
  ref: WalletRef,
  coins: CoinBag,
): Outcome {
  const wallet = walletOf(state, ref);
  if (!wallet) return fail('not_found');
  const valueBronze = toBronze(coins, catalog.currencies);
  if (valueBronze === 0) return fail('nothing_to_move');
  return ok(
    logAdjustment(setWallet(state, ref, addCoins(wallet, coins)), ref, valueBronze, wallet),
  );
}

/**
 * Master: removes the value of these coins, not the coins themselves: like a
 * construction, it pays from whatever the wallet holds and takes the change
 * back (5 Ouro + 50 Prata out of a wallet of Platina removes 10 PO). Refuses
 * when the wallet is worth less, leaving it untouched.
 */
export function takeCoins(
  state: GameState,
  catalog: Catalog,
  ref: WalletRef,
  coins: CoinBag,
): Outcome {
  const wallet = walletOf(state, ref);
  if (!wallet) return fail('not_found');
  const valueBronze = toBronze(coins, catalog.currencies);
  if (valueBronze === 0) return fail('nothing_to_move');
  const payment = pay(wallet, valueBronze, catalog.currencies);
  if (!payment.ok) return fail('insufficient_coins');
  return ok(logAdjustment(setWallet(state, ref, payment.wallet), ref, -valueBronze, wallet));
}

/** Logs what really changed: the value and each coin, change included. */
function logAdjustment(
  state: GameState,
  ref: WalletRef,
  valueBronze: number,
  before: CoinBag,
): GameState {
  const after = walletOf(state, ref) ?? {};
  return withLog(state, {
    day: state.day,
    kind: 'coins_adjusted',
    wallet: walletLabel(state, ref),
    delta: coinChanges(before, after),
    valueBronze,
  });
}

function coinChanges(before: CoinBag, after: CoinBag): AmountBag {
  const ids = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return Object.fromEntries(
    ids
      .map((id) => [id, (after[id] ?? 0) - (before[id] ?? 0)] as const)
      .filter(([, change]) => change !== 0),
  );
}

/** Player: moves coins from a character to the Acampamento in the same denominations. */
export function depositToCamp(state: GameState, characterId: string, coins: CoinBag): Outcome {
  const from: WalletRef = { kind: 'character', characterId };
  const character = state.characters.find((c) => c.id === characterId);
  if (!character) return fail('not_found');
  const moved = move(state, from, CAMP, coins);
  if (!moved.ok) return moved;
  return ok(
    withLog(moved.state, {
      day: state.day,
      kind: 'coins_deposited',
      character: character.name,
      coins,
    }),
  );
}

/** Master: moves coins between any two wallets, including out of the Acampamento. */
export function transferCoins(
  state: GameState,
  from: WalletRef,
  to: WalletRef,
  coins: CoinBag,
): Outcome {
  if (sameWallet(from, to)) return fail('same_wallet');
  const moved = move(state, from, to, coins);
  if (!moved.ok) return moved;
  return ok(
    withLog(moved.state, {
      day: state.day,
      kind: 'coins_transferred',
      from: walletLabel(state, from),
      to: walletLabel(state, to),
      coins,
    }),
  );
}

/** Master: swaps small coins for the biggest ones possible, same total value. */
export function consolidateWallet(state: GameState, catalog: Catalog, ref: WalletRef): Outcome {
  const wallet = walletOf(state, ref);
  if (!wallet) return fail('not_found');
  const next = consolidate(wallet, catalog.currencies);
  if (sameBag(wallet, next)) return ok(state);
  return ok(
    withLog(setWallet(state, ref, next), {
      day: state.day,
      kind: 'coins_consolidated',
      wallet: walletLabel(state, ref),
    }),
  );
}

/** Pays `costBronze` from the wallet, taking the change back. */
export function chargeWallet(
  state: GameState,
  catalog: Catalog,
  payer: WalletRef,
  costBronze: number,
): Outcome {
  const wallet = walletOf(state, payer);
  if (!wallet) return fail('not_found');
  const payment = pay(wallet, costBronze, catalog.currencies);
  return payment.ok ? ok(setWallet(state, payer, payment.wallet)) : fail('insufficient_coins');
}

export function setWallet(state: GameState, ref: WalletRef, wallet: CoinBag): GameState {
  if (ref.kind === 'camp') return { ...state, wallets: { ...state.wallets, camp: wallet } };
  return {
    ...state,
    wallets: {
      ...state.wallets,
      characters: { ...state.wallets.characters, [ref.characterId]: wallet },
    },
  };
}

function move(state: GameState, from: WalletRef, to: WalletRef, coins: CoinBag): Outcome {
  const source = walletOf(state, from);
  const target = walletOf(state, to);
  if (!source || !target) return fail('not_found');
  if (isEmptyBag(coins)) return fail('nothing_to_move');
  if (!hasCoins(source, coins)) return fail('insufficient_coins');
  const withdrawn = setWallet(state, from, removeCoins(source, coins));
  return ok(setWallet(withdrawn, to, addCoins(target, coins)));
}

export function walletLabel(state: GameState, ref: WalletRef): string | undefined {
  if (ref.kind === 'camp') return undefined;
  return state.characters.find((c) => c.id === ref.characterId)?.name ?? ref.characterId;
}

function sameWallet(a: WalletRef, b: WalletRef): boolean {
  if (a.kind === 'camp' || b.kind === 'camp') return a.kind === b.kind;
  return a.characterId === b.characterId;
}

function sameBag(a: CoinBag, b: CoinBag): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...ids].every((id) => (a[id] ?? 0) === (b[id] ?? 0));
}
