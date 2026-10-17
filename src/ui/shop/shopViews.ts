import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import { fromBronze } from '../../systems/Coins';
import type { ShopEntry } from '../../systems/Shop';
import { CAMP, type WalletRef } from '../../systems/Wallets';
import { el } from '../dom';
import { formatPrice } from '../format';
import {
  button,
  closeButton,
  confirmButton,
  field,
  keepEscapeInside,
  numberInput,
  parseCount,
  selectInput,
  thumb,
  type ImageSource,
} from '../widgets';

export const SHOP_FILTERS = ['tudo', 'basicos', 'raros'] as const;
export type ShopFilter = (typeof SHOP_FILTERS)[number];

/** Basics are the infinite-stock staples; everything with a finite stock is rare. */
export function filterEntries(entries: ShopEntry[], filter: ShopFilter): ShopEntry[] {
  if (filter === 'tudo') return entries;
  return entries.filter((entry) => entry.isBasic === (filter === 'basicos'));
}

export interface ShopCardModel {
  name: string;
  image: string | undefined;
  priceText: string;
  /** Base price, only while a promotion lowers it. */
  oldPriceText?: string;
  ribbon?: string;
  stockText: string | number;
  isOut: boolean;
}

export function shopCardModel(entry: ShopEntry, catalog: Catalog): ShopCardModel {
  const { item } = entry;
  const promo =
    item.discountPercent === undefined
      ? {}
      : {
          oldPriceText: formatPrice(catalog, item.price),
          ribbon: `−${item.discountPercent}%`,
        };
  return {
    name: entry.name,
    image: entry.image,
    priceText: formatPrice(catalog, fromBronze(entry.unitBronze, catalog.currencies)),
    ...promo,
    stockText: item.stock ?? t.shop.unlimited,
    isOut: item.stock === 0,
  };
}

export interface ShopCardContext extends ImageSource {
  onBuy(): void;
  /** Master only: opens the promotion editor. */
  onPromo?(): void;
  /** Master only. */
  onEdit?(): void;
  onRemove?(): void;
  /** Entreposto level 3 and some of the material in the camp stock. */
  onSell?(): void;
}

export function shopCard(entry: ShopEntry, ctx: ShopCardContext): HTMLElement {
  const model = shopCardModel(entry, ctx.catalog);
  const classes = [
    'shop-card',
    model.isOut && 'shop-card--out',
    entry.isLocked && 'shop-card--locked',
  ];
  return el(
    'li',
    { class: classes.filter(Boolean).join(' ') },
    model.ribbon && el('span', { class: 'shop-card__ribbon' }, model.ribbon),
    thumb(ctx, { image: model.image, name: model.name }, 'lg'),
    el('h3', { class: 'shop-card__name' }, model.name),
    el(
      'p',
      { class: 'shop-card__price' },
      el('strong', {}, model.priceText),
      model.oldPriceText && el('s', { class: 'shop-card__old' }, model.oldPriceText),
    ),
    el('p', { class: 'shop-card__stock' }, t.shop.stock(model.stockText)),
    entry.isLocked && el('p', { class: 'shop-card__note' }, t.shop.lockedAt(entry.item.minLevel)),
    entry.item.hidden && el('p', { class: 'shop-card__note' }, t.shop.hidden),
    el(
      'div',
      { class: 'row' },
      button(model.isOut ? t.shop.outOfStock : t.shop.buy, ctx.onBuy, {
        primary: true,
        disabled: model.isOut,
      }),
      ctx.onSell && button(t.shop.sell, ctx.onSell),
      ctx.onPromo && button(t.shop.promo, ctx.onPromo),
    ),
    (ctx.onEdit || ctx.onRemove) &&
      el(
        'div',
        { class: 'row' },
        ctx.onEdit && button(t.shop.master.edit, ctx.onEdit),
        ctx.onRemove && confirmButton(t.shop.master.remove, ctx.onRemove),
      ),
  );
}

export interface ConfirmOptions {
  catalog: Catalog;
  title: string;
  lines: string[];
  /** Price of the whole lot; 0 reads "de graça". */
  totalBronze: (quantity: number) => number;
  /** null: the master, who pays nothing (also used when selling, where no one is charged). */
  payers: WalletRef[] | null;
  payerLabel?: (payer: WalletRef) => string;
  /** null: no upper bound beyond the server's. */
  maxQuantity: number | null;
  /** No quantity input; the result has quantity 1. */
  fixedQuantity?: true;
  action?: 'buy' | 'sell';
}

export interface Confirmation {
  quantity: number;
  payer: WalletRef;
}

/** Resolves with the choice, or null when the player cancels or closes the dialog. */
export function confirmPurchase(opts: ConfirmOptions): Promise<Confirmation | null> {
  const isSell = opts.action === 'sell';
  const texts = t.shop.confirm;
  const quantityInput = numberInput({
    value: 1,
    min: 1,
    max: opts.maxQuantity ?? undefined,
    label: texts.quantity,
  });
  const payers = opts.payers ?? [];
  const payerSelect = selectInput({
    label: texts.payer,
    value: '0',
    options: payers.map((payer, index) => ({
      value: String(index),
      label: opts.payerLabel?.(payer) ?? t.shop.payerCamp,
    })),
  });
  const total = el('strong', {});
  const confirm = button(isSell ? texts.sell : texts.buy, () => dialog.close('confirmed'), {
    primary: true,
  });

  const quantity = () => (opts.fixedQuantity ? 1 : parseCount(quantityInput.value));
  const isValid = () =>
    quantity() >= 1 && (opts.maxQuantity === null || quantity() <= opts.maxQuantity);
  const refresh = () => {
    const bronze = opts.totalBronze(quantity());
    total.textContent =
      bronze === 0
        ? t.shop.free
        : formatPrice(opts.catalog, fromBronze(bronze, opts.catalog.currencies));
    confirm.disabled = !isValid();
  };
  quantityInput.addEventListener('input', refresh);

  const dialog = el(
    'dialog',
    { class: 'dialog dialog--shop-confirm', 'aria-label': opts.title },
    el(
      'header',
      { class: 'menu__header' },
      el('h2', { class: 'panel__title' }, opts.title),
      closeButton(texts.cancel, () => dialog.close()),
    ),
    el(
      'div',
      { class: 'shop-confirm__body' },
      ...opts.lines.map((line) => el('p', { class: 'panel__hint' }, line)),
      !opts.fixedQuantity && field(texts.quantity, quantityInput),
      payers.length > 1 && field(texts.payer, payerSelect),
      el('p', {}, isSell ? texts.receive : texts.total, ': ', total),
      el(
        'div',
        { class: 'row row--end' },
        button(texts.cancel, () => dialog.close()),
        confirm,
      ),
    ),
  );
  keepEscapeInside(dialog);
  refresh();

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      const payer = payers[Number(payerSelect.value)] ?? payers[0] ?? CAMP;
      resolve(
        dialog.returnValue === 'confirmed' && isValid() ? { quantity: quantity(), payer } : null,
      );
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export const PROMO_PRESETS = [10, 25, 50] as const;
const MAX_DISCOUNT = 90;

/** The whole percent typed, or null when it is not between 1 and 90. */
export function parseDiscount(text: string): number | null {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= MAX_DISCOUNT ? value : null;
}

type PromotionChoice = number | null | undefined;

/**
 * Promotion editor: presets, a free percent and "Tirar promoção".
 * Resolves with the percent, `null` to end the promotion, or `undefined` when closed.
 */
export function askPromotion(name: string, current: number | undefined): Promise<PromotionChoice> {
  const texts = t.shop.master.promo;
  const percent = numberInput({ value: current, min: 1, max: MAX_DISCOUNT, label: texts.percent });
  const apply = button(texts.apply, () => dialog.close('apply'), { primary: true });
  const refresh = () => {
    apply.disabled = parseDiscount(percent.value) === null;
  };
  percent.addEventListener('input', refresh);
  refresh();

  const dialog = el(
    'dialog',
    { class: 'dialog dialog--shop-confirm', 'aria-label': texts.title(name) },
    el(
      'header',
      { class: 'menu__header' },
      el('h2', { class: 'panel__title' }, texts.title(name)),
      closeButton(t.shop.master.form.close, () => dialog.close()),
    ),
    el(
      'div',
      { class: 'shop-confirm__body' },
      el(
        'div',
        { class: 'row' },
        ...PROMO_PRESETS.map((preset) =>
          button(`${preset}%`, () => {
            percent.value = String(preset);
            dialog.close('apply');
          }),
        ),
      ),
      field(texts.percent, percent),
      el(
        'div',
        { class: 'row row--end' },
        current !== undefined && button(texts.clear, () => dialog.close('clear')),
        apply,
      ),
    ),
  );
  keepEscapeInside(dialog);

  const choice = (): PromotionChoice => {
    if (dialog.returnValue === 'clear') return null;
    return dialog.returnValue === 'apply' ? (parseDiscount(percent.value) ?? undefined) : undefined;
  };
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      resolve(choice());
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}
