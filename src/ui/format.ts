import { listText, t, type TextContext } from '../i18n/pt-BR';
import { findBuilding, goldInBronze, type Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import { copyNumber } from '../systems/BuildSystem';
import { consolidate, fromBronze, goldToBronze, type CoinBag } from '../systems/Coins';
import { findMaterial } from '../systems/Materials';

const goldFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat('pt-BR');

/** "1.234,5 PO". Display only: the division never feeds back into coin math. */
export function formatGold(catalog: Catalog, bronze: number): string {
  return `${formatGoldAmount(catalog, bronze)} ${t.resources.goldUnit}`;
}

/** The gold value without its unit, for tight spots like the compact top bar. */
export function formatGoldAmount(catalog: Catalog, bronze: number): string {
  return goldFormat.format(bronze / goldInBronze(catalog));
}

export function formatCount(n: number): string {
  return countFormat.format(n);
}

export function textContext(catalog: Catalog, state: GameState): TextContext {
  return {
    building: (id) => findBuilding(catalog, id)?.name ?? id,
    buildingAt: (id, slotId) => buildingLabel(catalog, id, slotId),
    material: (id) => findMaterial(state.materials, id)?.name ?? id,
    gold: (bronze) => formatGold(catalog, bronze),
    coins: (bag: CoinBag) => formatCoins(catalog, bag),
  };
}

/** "Alojamento II": copies get a stable roman number (see `copyNumber`); unique buildings just their name. */
export function buildingLabel(catalog: Catalog, buildingId: string, slotId?: string): string {
  const name = findBuilding(catalog, buildingId)?.name ?? buildingId;
  const number = slotId === undefined ? undefined : copyNumber(catalog, buildingId, slotId);
  return number === undefined ? name : `${name} ${toRoman(number)}`;
}

const ROMAN: readonly [number, string][] = [
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Small numbers only (the layout has a few dozen slots). */
export function toRoman(n: number): string {
  const [entry] = ROMAN.filter(([value]) => value <= n);
  return entry ? entry[1] + toRoman(n - entry[0]) : '';
}

/** "1 Prata e 2 Bronze", biggest coins first. */
export function formatCoins(catalog: Catalog, bag: CoinBag): string {
  return listText(
    catalog.currencies
      .filter((c) => (bag[c.id] ?? 0) > 0)
      .map((c) => `${formatCount(bag[c.id] ?? 0)} ${c.name}`),
  );
}

/** "Salário: 1 Prata e 2 Bronze/dia", or "Sem salário" when it is 0 or unset. */
export function formatWage(catalog: Catalog, wage: number | undefined): string {
  const bronze = goldToBronze(wage ?? 0, goldInBronze(catalog));
  if (bronze === 0) return t.npcs.noWage;
  return t.npcs.wageText(formatCoins(catalog, fromBronze(bronze, catalog.currencies)));
}

/** A dish price in the biggest coins, like wages: { bronze: 12 } reads "1 Prata e 2 Bronze". */
export function formatPrice(catalog: Catalog, price: CoinBag): string {
  return formatCoins(catalog, consolidate(price, catalog.currencies));
}
