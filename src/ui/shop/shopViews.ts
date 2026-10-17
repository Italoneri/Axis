import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import { consolidate, fromBronze, type CoinBag } from '../../systems/Coins';
import type { ShopEntry } from '../../systems/Shop';
import { CAMP, type WalletRef } from '../../systems/Wallets';
import { el } from '../dom';
import { formatCount, formatPrice } from '../format';
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
  /** Biggest coins first, as drawn with their icons. */
  price: CoinBag;
  priceText: string;
  /** Base price, only while a promotion lowers it. */
  oldPrice?: CoinBag;
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
          oldPrice: consolidate(item.price, catalog.currencies),
          oldPriceText: formatPrice(catalog, item.price),
          ribbon: `−${item.discountPercent}%`,
        };
  const price = fromBronze(entry.unitBronze, catalog.currencies);
  return {
    name: entry.name,
    image: entry.image,
    price,
    priceText: formatPrice(catalog, price),
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

/**
 * A square tile on the merchant's counter: picture in a niche, name, price in
 * coins and the buy button at the base. The master's tools float over the
 * picture so they never change the tile's size.
 */
export function shopCard(entry: ShopEntry, ctx: ShopCardContext): HTMLElement {
  const model = shopCardModel(entry, ctx.catalog);
  const classes = [
    'shop-card',
    model.isOut && 'shop-card--out',
    entry.isLocked && 'shop-card--locked',
    entry.item.hidden && 'shop-card--hidden',
  ];
  return el(
    'li',
    { class: classes.filter(Boolean).join(' ') },
    shopCardMedia(entry, model, ctx),
    el('h3', { class: 'shop-card__name', title: model.name }, model.name),
    el(
      'p',
      { class: 'shop-card__price' },
      model.oldPrice &&
        el(
          's',
          { class: 'shop-card__old' },
          coinPrice(ctx.catalog, model.oldPrice),
          el('span', { class: 'shop-card__sr' }, model.oldPriceText),
        ),
      el(
        'strong',
        { class: 'shop-card__now' },
        coinPrice(ctx.catalog, model.price),
        el('span', { class: 'shop-card__sr' }, model.priceText),
      ),
    ),
    el(
      'div',
      { class: 'shop-card__actions' },
      button(model.isOut ? t.shop.outOfStock : t.shop.buy, ctx.onBuy, {
        primary: true,
        disabled: model.isOut,
      }),
      ctx.onSell && button(t.shop.sell, ctx.onSell),
    ),
  );
}

const FALLBACK_ICONS = { material: 'icon.materials', equipment: 'icon.armory' } as const;

function shopCardMedia(entry: ShopEntry, model: ShopCardModel, ctx: ShopCardContext): HTMLElement {
  const { item } = entry;
  const badges = [
    entry.isLocked && t.shop.lockedAt(item.minLevel),
    item.hidden && t.shop.hidden,
  ].filter((badge) => badge !== false);
  return el(
    'div',
    { class: 'shop-card__media' },
    thumb(ctx, { image: model.image, name: model.name, fallback: FALLBACK_ICONS[item.kind] }, 'lg'),
    el(
      'span',
      { class: 'shop-card__stock', title: t.shop.stock(model.stockText) },
      el('span', { 'aria-hidden': 'true' }, String(model.stockText)),
      el('span', { class: 'shop-card__sr' }, t.shop.stock(model.stockText)),
    ),
    model.ribbon && el('span', { class: 'shop-card__ribbon' }, model.ribbon),
    badges.length > 0 &&
      el(
        'span',
        { class: 'shop-card__badges' },
        ...badges.map((badge) => el('span', { class: 'shop-card__badge' }, badge)),
      ),
    model.isOut &&
      el('span', { class: 'shop-card__sold', 'aria-hidden': 'true' }, t.shop.outOfStock),
    masterTools(ctx),
  );
}

/** Icon-only buttons; their names come from aria-label and title. */
function masterTools(ctx: ShopCardContext): HTMLElement | false {
  const texts = t.shop.master;
  const tools = [
    ctx.onPromo && iconButton('%', t.shop.promo, ctx.onPromo),
    ctx.onEdit && iconButton('✎', texts.edit, ctx.onEdit),
    ctx.onRemove && removeButton(ctx.onRemove),
  ].filter((tool) => tool !== undefined);
  if (tools.length === 0) return false;
  return el(
    'div',
    { class: 'shop-card__tools', role: 'group', 'aria-label': texts.tools },
    ...tools,
  );
}

function iconButton(icon: string, label: string, onclick: () => void): HTMLButtonElement {
  return el(
    'button',
    { class: 'btn shop-tool', type: 'button', 'aria-label': label, title: label, onclick },
    icon,
  );
}

function removeButton(onRemove: () => void): HTMLButtonElement {
  const label = t.shop.master.remove;
  const node = confirmButton('✕', onRemove, t.shop.master.confirmRemove);
  node.classList.add('shop-tool');
  node.setAttribute('aria-label', label);
  node.title = label;
  return node;
}

/** "3 [bronze]": each coin with its icon, biggest first; screen readers get the text beside it. */
function coinPrice(catalog: Catalog, bag: CoinBag): HTMLElement {
  const coins = catalog.currencies.filter((currency) => (bag[currency.id] ?? 0) > 0);
  return el(
    'span',
    { class: 'coin-price', 'aria-hidden': 'true' },
    ...coins.map((currency) =>
      el(
        'span',
        { class: 'coin-price__coin' },
        formatCount(bag[currency.id] ?? 0),
        thumb({ catalog }, { image: currency.icon, name: currency.name }),
      ),
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
