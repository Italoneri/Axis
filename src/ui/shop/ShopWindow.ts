import type { Actor } from '../../commands/schema';
import type { ShopItem } from '../../model/schema';
import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import type { GameStore } from '../../store';
import { fromBronze } from '../../systems/Coins';
import {
  sellBackBronze,
  SELL_BACK_LEVEL,
  shopEntries,
  tradingPostLevel,
  unitPriceBronze,
  type ShopEntry,
  type ShopItemFields,
} from '../../systems/Shop';
import { CAMP, type WalletRef } from '../../systems/Wallets';
import { el } from '../dom';
import { formatPrice } from '../format';
import type { MasterAccess } from '../MasterSession';
import type { UiMemory } from '../uiMemory';
import { button, closeButton, keepEscapeInside } from '../widgets';
import { openShopItemForm } from './ShopItemForm';
import {
  askPromotion,
  confirmPurchase,
  filterEntries,
  shopCard,
  SHOP_FILTERS,
  type ShopFilter,
} from './shopViews';

const FILTER_MEMORY_KEY = 'shop.filter';

export interface ShopWindowDeps {
  game: GameStore;
  session: MasterAccess;
  memory: UiMemory;
  viewer: () => Actor;
}

/**
 * "Entreposto — Comércio": a large <dialog> with the filter tabs, the passing
 * merchant's banner and a grid of cards. It re-renders with the game, so stock
 * and promotions change while the window is open.
 */
export class ShopWindow {
  private dialog: HTMLDialogElement | null = null;
  private filter: ShopFilter = 'tudo';
  private stopWatching: (() => void) | null = null;
  private readonly tabs = el('nav', { class: 'tabs', role: 'tablist' });
  private readonly toolbar = el('div', { class: 'row' });
  private readonly body = el('div', { class: 'menu__body' });

  constructor(private readonly deps: ShopWindowDeps) {
    // Entering or leaving the master tools changes what the shop shows.
    deps.session.subscribe(() => this.render());
  }

  open(): void {
    if (this.dialog) return;
    this.filter = parseFilter(this.deps.memory.pick(FILTER_MEMORY_KEY, SHOP_FILTERS, 'tudo'));
    const dialog = this.buildDialog();
    this.dialog = dialog;
    this.stopWatching = this.deps.game.subscribe(() => this.render());
    document.body.append(dialog);
    this.render();
    dialog.showModal();
  }

  private buildDialog(): HTMLDialogElement {
    const dialog = el(
      'dialog',
      { class: 'dialog dialog--menu', 'aria-label': t.shop.title },
      el(
        'header',
        { class: 'menu__header' },
        el('h2', { class: 'panel__title' }, t.shop.title),
        closeButton(t.shop.close, () => dialog.close()),
      ),
      this.tabs,
      this.toolbar,
      this.body,
    );
    keepEscapeInside(dialog);
    dialog.addEventListener('close', () => {
      this.stopWatching?.();
      this.stopWatching = null;
      dialog.remove();
      this.dialog = null;
    });
    return dialog;
  }

  private render(): void {
    if (!this.dialog) return;
    const { catalog, current } = this.deps.game;
    const entries = shopEntries(current, catalog, this.deps.viewer());
    const featured = entries.filter((entry) => entry.item.featured);
    const shown = filterEntries(entries, this.filter);
    this.toolbar.replaceChildren(
      ...(this.isMaster()
        ? [button(t.shop.master.newItem, () => this.editItem(), { primary: true })]
        : []),
    );
    this.tabs.replaceChildren(...SHOP_FILTERS.map((filter) => this.tab(filter)));
    this.body.replaceChildren(
      ...(tradingPostLevel(current) < 1 ? [el('p', { class: 'notice' }, t.shop.notBuilt)] : []),
      ...(featured.length > 0 ? [this.banner(featured)] : []),
      shown.length === 0
        ? el('p', { class: 'panel__hint' }, t.shop.empty)
        : el(
            'ul',
            { class: 'menu__grid', role: 'tabpanel' },
            ...shown.map((entry) => this.card(entry)),
          ),
    );
  }

  private tab(filter: ShopFilter): HTMLElement {
    const isActive = filter === this.filter;
    return el(
      'button',
      {
        class: isActive ? 'tab tab--active' : 'tab',
        type: 'button',
        role: 'tab',
        'aria-selected': String(isActive),
        onclick: () => {
          this.filter = filter;
          this.deps.memory.set(FILTER_MEMORY_KEY, filter);
          this.render();
        },
      },
      t.shop.filters[filter],
    );
  }

  private banner(featured: ShopEntry[]): HTMLElement {
    return el(
      'section',
      { class: 'shop-banner' },
      el('h3', { class: 'section-title' }, t.shop.merchant),
      el('ul', { class: 'menu__grid' }, ...featured.map((entry) => this.card(entry))),
    );
  }

  private card(entry: ShopEntry): HTMLElement {
    const { game } = this.deps;
    const canSell =
      this.heldQuantity(entry) > 0 && tradingPostLevel(game.current) >= SELL_BACK_LEVEL;
    return shopCard(entry, {
      catalog: game.catalog,
      images: game.images,
      onBuy: () => void this.buy(entry),
      ...(canSell ? { onSell: () => void this.sell(entry) } : {}),
      ...(this.isMaster()
        ? {
            onPromo: () => void this.promote(entry),
            onEdit: () => this.editItem(entry.item),
            onRemove: () => void game.dispatch({ type: 'shop_item_remove', itemId: entry.item.id }),
          }
        : {}),
    });
  }

  private isMaster(): boolean {
    return this.deps.viewer().role === 'master';
  }

  private async promote(entry: ShopEntry): Promise<void> {
    const discount = await askPromotion(entry.name, entry.item.discountPercent);
    if (discount === undefined) return;
    void this.deps.game.dispatch({
      type: 'shop_set_promotion',
      itemId: entry.item.id,
      discountPercent: discount,
    });
  }

  private editItem(item?: ShopItem): void {
    openShopItemForm({
      game: this.deps.game,
      ...(item ? { item } : {}),
      save: (id, fields, image) => this.saveItem(item, id, fields, image),
    });
  }

  /** The photo goes in its own command, after the item exists. */
  private saveItem(
    item: ShopItem | undefined,
    id: string,
    fields: ShopItemFields,
    image: string,
  ): boolean {
    const { game } = this.deps;
    const saved =
      game.dispatch(
        item
          ? { type: 'shop_item_update', itemId: id, item: fields }
          : { type: 'shop_item_create', id, item: fields },
      ) === null;
    if (!saved || image === (item?.image ?? '')) return saved;
    // The item exists now; a refused photo is already toasted and can be retried by editing.
    void game.dispatch({ type: 'set_image', target: { kind: 'shop_item', id }, image });
    return true;
  }

  private heldQuantity(entry: ShopEntry): number {
    const { item } = entry;
    if (item.kind !== 'material') return 0;
    const held = this.deps.game.current.materials.items.find((m) => m.id === item.materialId);
    return held?.quantity ?? 0;
  }

  private payers(viewer: Actor): WalletRef[] | null {
    if (viewer.role === 'master') return null;
    return viewer.characterId === undefined
      ? [CAMP]
      : [CAMP, { kind: 'character', characterId: viewer.characterId }];
  }

  private readonly payerLabel = (payer: WalletRef): string => {
    if (payer.kind === 'camp') return t.shop.payerCamp;
    return this.deps.game.current.characters.find((c) => c.id === payer.characterId)?.name ?? '';
  };

  private async buy(entry: ShopEntry): Promise<void> {
    const { game } = this.deps;
    const viewer = this.deps.viewer();
    const unit = unitPriceBronze(entry.item, game.catalog);
    const choice = await confirmPurchase({
      catalog: game.catalog,
      title: t.shop.confirm.buyTitle(entry.name),
      lines: [t.shop.confirm.unitPrice(this.priceOf(unit))],
      totalBronze: (quantity) => (viewer.role === 'master' ? 0 : unit * quantity),
      payers: this.payers(viewer),
      payerLabel: this.payerLabel,
      maxQuantity: entry.item.stock,
    });
    if (!choice) return;
    game.dispatch({
      type: 'shop_buy',
      itemId: entry.item.id,
      quantity: choice.quantity,
      payer: choice.payer,
      deliveryId: newId('item'),
    });
  }

  private async sell(entry: ShopEntry): Promise<void> {
    const { game } = this.deps;
    const { item } = entry;
    if (item.kind !== 'material') return;
    const held = this.heldQuantity(entry);
    const choice = await confirmPurchase({
      catalog: game.catalog,
      title: t.shop.confirm.sellTitle(entry.name),
      lines: [t.shop.confirm.held(held)],
      totalBronze: (quantity) => sellBackBronze(item, quantity, game.catalog),
      payers: null,
      maxQuantity: held,
      action: 'sell',
    });
    if (!choice) return;
    game.dispatch({ type: 'shop_sell', materialId: item.materialId, quantity: choice.quantity });
  }

  private priceOf(bronze: number): string {
    const { catalog } = this.deps.game;
    return formatPrice(catalog, fromBronze(bronze, catalog.currencies));
  }
}

function parseFilter(value: string): ShopFilter {
  return SHOP_FILTERS.find((filter) => filter === value) ?? 'tudo';
}
