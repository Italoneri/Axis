import type { Catalog } from '../model/catalog';
import type { AmountBag, GameState } from '../model/schema';
import {
  addCoins,
  consolidate,
  hasCoins,
  isEmptyBag,
  removeCoins,
  toBronze,
  type CoinBag,
} from './Coins';
import { fail, ok, withLog, type Outcome } from './outcome';
import { applyResourceDelta } from './ResourceSystem';

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

/** Master: gives (positive) or takes (negative) coins, never below zero; logs what changed. */
export function adjustCoins(state: GameState, ref: WalletRef, delta: AmountBag): Outcome {
  const wallet = walletOf(state, ref);
  if (!wallet) return fail('not_found');
  const { resources, applied } = applyResourceDelta(wallet, delta);
  if (Object.keys(applied).length === 0) return ok(state);
  return ok(
    withLog(setWallet(state, ref, dropZeros(resources)), {
      day: state.day,
      kind: 'coins_adjusted',
      wallet: walletLabel(state, ref),
      delta: applied,
    }),
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

function walletLabel(state: GameState, ref: WalletRef): string | undefined {
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

function dropZeros(bag: AmountBag): CoinBag {
  return Object.fromEntries(Object.entries(bag).filter(([, n]) => n > 0));
}
