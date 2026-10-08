import { listText, t, type TextContext } from '../i18n/pt-BR';
import { findBuilding, goldInBronze, type Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { CoinBag } from '../systems/Coins';
import { findMaterial } from '../systems/Materials';

const goldFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const countFormat = new Intl.NumberFormat('pt-BR');

/** "1.234,5 PO". Display only: the division never feeds back into coin math. */
export function formatGold(catalog: Catalog, bronze: number): string {
  return `${goldFormat.format(bronze / goldInBronze(catalog))} ${t.resources.goldUnit}`;
}

export function formatCount(n: number): string {
  return countFormat.format(n);
}

export function textContext(catalog: Catalog, state: GameState): TextContext {
  return {
    building: (id) => findBuilding(catalog, id)?.name ?? id,
    material: (id) => findMaterial(state.materials, id)?.name ?? id,
    gold: (bronze) => formatGold(catalog, bronze),
    coins: (bag: CoinBag) =>
      listText(
        catalog.currencies
          .filter((c) => (bag[c.id] ?? 0) > 0)
          .map((c) => `${formatCount(bag[c.id] ?? 0)} ${c.name}`),
      ),
  };
}
