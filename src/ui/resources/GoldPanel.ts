import { t } from '../../i18n/pt-BR';
import type { Character, GameState } from '../../model/schema';
import type { GameStore } from '../../store';
import { toBronze, type CoinBag } from '../../systems/Coins';
import {
  adjustCoins,
  CAMP,
  consolidateWallet,
  depositToCamp,
  groupBronze,
  transferCoins,
  walletOf,
  type WalletRef,
} from '../../systems/Wallets';
import { actingCharacter } from '../currentActor';
import { el } from '../dom';
import { formatCount, formatGold } from '../format';
import type { MasterSession } from '../MasterSession';
import type { ResourceMenuItem } from '../ResourceMenu';
import { button, coinInputs, thumb, type Act } from '../widgets';

/** Wallets in <select> values and UI state: "camp" or "character:<id>". */
type WalletKey = string;

const keyOf = (ref: WalletRef): WalletKey =>
  ref.kind === 'camp' ? 'camp' : `character:${ref.characterId}`;

const refOf = (key: WalletKey): WalletRef =>
  key.startsWith('character:')
    ? { kind: 'character', characterId: key.slice('character:'.length) }
    : CAMP;

/** Ouro: the Acampamento's coins, and on demand every character's wallet. */
export class GoldPanel {
  private showDetails = false;
  private depositingFor: string | null = null;
  private adjusting: WalletKey | null = null;
  /** Redraws the dropdown after purely visual changes (toggles, opened forms). */
  private redraw: () => void = () => undefined;

  constructor(
    private readonly store: GameStore,
    private readonly session: MasterSession,
    private readonly act: Act,
  ) {}

  get menuItem(): ResourceMenuItem {
    const { catalog } = this.store;
    return {
      id: 'gold',
      label: t.resources.gold,
      icon: 'icon.gold',
      summary: (state) => formatGold(catalog, toBronze(state.wallets.camp, catalog.currencies)),
      render: (redraw) => {
        this.redraw = redraw;
        return this.render();
      },
    };
  }

  private render(): HTMLElement[] {
    const state = this.store.current;
    const toggle = button(this.showDetails ? t.gold.hideDetails : t.gold.showDetails, () => {
      this.showDetails = !this.showDetails;
      this.redraw();
    });
    // The detailed view opens with the Acampamento card, so it replaces the summary.
    if (this.showDetails) return [toggle, ...this.renderDetails(state)];
    return [
      el('h3', { class: 'popover__title' }, t.gold.camp),
      this.coinList(state.wallets.camp),
      el('p', { class: 'panel__hint' }, t.gold.campHint),
      toggle,
    ];
  }

  private renderDetails(state: GameState): HTMLElement[] {
    const { catalog } = this.store;
    const isMaster = this.session.isActive;
    return [
      this.walletCard(state, CAMP, { title: t.gold.camp, highlight: true }),
      ...(state.characters.length === 0
        ? [el('p', { class: 'panel__hint' }, t.gold.noCharacters)]
        : state.characters.map((character) =>
            this.walletCard(
              state,
              { kind: 'character', characterId: character.id },
              {
                title: character.name,
                character,
              },
            ),
          )),
      el(
        'p',
        { class: 'wealth', title: t.gold.groupWealthHint },
        el('span', {}, t.gold.groupWealth),
        el('strong', {}, formatGold(catalog, groupBronze(state, catalog))),
      ),
      ...(isMaster ? [this.transferCard(state)] : []),
    ];
  }

  private walletCard(
    state: GameState,
    ref: WalletRef,
    {
      title,
      highlight = false,
      character,
    }: { title: string; highlight?: boolean; character?: Character },
  ): HTMLElement {
    const { catalog } = this.store;
    const wallet = walletOf(state, ref) ?? {};
    const key = keyOf(ref);
    const isMaster = this.session.isActive;
    return el(
      'article',
      { class: highlight ? 'card card--highlight' : 'card' },
      el(
        'div',
        { class: 'card__head' },
        character &&
          thumb(catalog, {
            image: character.portrait,
            name: character.name,
            color: character.color,
          }),
        el('h3', { class: 'card__name' }, title),
      ),
      this.coinList(wallet),
      character &&
        (this.depositingFor === character.id
          ? this.depositForm(character, wallet)
          : button(t.gold.deposit, () => this.openDeposit(character.id), {
              disabled: toBronze(wallet, catalog.currencies) === 0,
            })),
      isMaster &&
        el(
          'div',
          { class: 'row row--wrap' },
          button(t.gold.adjust, () => {
            this.adjusting = this.adjusting === key ? null : key;
            this.redraw();
          }),
          button(t.gold.consolidate, () => this.act((s) => consolidateWallet(s, catalog, ref))),
        ),
      isMaster && this.adjusting === key && this.adjustForm(ref),
    );
  }

  /** Coins from the most to the least valuable, with their worth in gold and the total. */
  private coinList(wallet: CoinBag): HTMLElement {
    const { catalog } = this.store;
    return el(
      'div',
      {},
      el(
        'ul',
        { class: 'coin-list' },
        ...catalog.currencies.map((currency) => {
          const count = wallet[currency.id] ?? 0;
          return el(
            'li',
            { class: count === 0 ? 'coin coin--empty' : 'coin' },
            thumb(catalog, { image: currency.icon, name: currency.name }),
            el('span', { class: 'coin__name' }, currency.name),
            el('span', { class: 'coin__count' }, formatCount(count)),
            el('span', { class: 'coin__value' }, formatGold(catalog, count * currency.bronzeValue)),
          );
        }),
      ),
      el(
        'p',
        { class: 'coin-total' },
        el('span', {}, t.gold.total),
        el('strong', {}, formatGold(catalog, toBronze(wallet, catalog.currencies))),
      ),
    );
  }

  private depositForm(character: Character, wallet: CoinBag): HTMLElement {
    const { catalog } = this.store;
    const total = el('strong', {}, formatGold(catalog, 0));
    const inputs = coinInputs(catalog, {
      max: wallet,
      onInput: (coins) =>
        (total.textContent = formatGold(catalog, toBronze(coins, catalog.currencies))),
    });
    const submit = () => {
      const depositor = actingCharacter(character.id);
      if (this.act((s) => depositToCamp(s, depositor, inputs.read()))) this.depositingFor = null;
    };
    return el(
      'div',
      { class: 'subform' },
      inputs.element,
      el('p', { class: 'coin-total' }, el('span', {}, t.gold.depositTotal), total),
      el(
        'div',
        { class: 'row row--end' },
        button(t.common.cancel, () => this.openDeposit(null)),
        button(t.gold.confirmDeposit, submit, { primary: true }),
      ),
    );
  }

  private adjustForm(ref: WalletRef): HTMLElement {
    const inputs = coinInputs(this.store.catalog);
    const apply = (sign: 1 | -1) => {
      const delta = Object.fromEntries(
        Object.entries(inputs.read()).map(([id, n]) => [id, sign * n]),
      );
      if (this.act((s) => adjustCoins(s, ref, delta))) inputs.clear();
    };
    return el(
      'div',
      { class: 'subform card--master' },
      inputs.element,
      el(
        'div',
        { class: 'row row--end' },
        button(t.gold.take, () => apply(-1)),
        button(t.gold.give, () => apply(1), { primary: true }),
      ),
    );
  }

  private transferCard(state: GameState): HTMLElement {
    const options = [
      { key: 'camp', label: t.gold.camp },
      ...state.characters.map((c) => ({ key: `character:${c.id}`, label: c.name })),
    ];
    const select = (selected: string, label: string) =>
      el(
        'select',
        { class: 'input', 'aria-label': label },
        ...options.map((o) =>
          el('option', { value: o.key, selected: o.key === selected }, o.label),
        ),
      );
    const from = select('camp', t.gold.from);
    const to = select(options[1]?.key ?? 'camp', t.gold.to);
    const inputs = coinInputs(this.store.catalog);
    const submit = () => {
      if (this.act((s) => transferCoins(s, refOf(from.value), refOf(to.value), inputs.read()))) {
        inputs.clear();
      }
    };
    return el(
      'section',
      { class: 'card card--master' },
      el('h3', { class: 'section-title' }, t.gold.transferTitle),
      el(
        'div',
        { class: 'row row--wrap' },
        el('label', { class: 'field' }, t.gold.from, from),
        el('label', { class: 'field' }, t.gold.to, to),
      ),
      inputs.element,
      el('div', { class: 'row row--end' }, button(t.gold.transfer, submit, { primary: true })),
    );
  }

  private openDeposit(characterId: string | null): void {
    this.depositingFor = characterId;
    this.redraw();
  }
}
