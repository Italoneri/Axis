import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { GameStore } from '../store';
import { el, replaceKeepingScroll } from './dom';
import type { MasterAccess } from './MasterSession';
import { thumb } from './widgets';

export interface ResourceMenuItem {
  id: string;
  label: string;
  /** Asset key of the top bar icon. */
  icon: string;
  summary: (state: GameState) => string;
  /** Just the number, shown when the top bar is too narrow for names and full summaries. */
  compactSummary: (state: GameState) => string;
  /**
   * Dropdown content; called again after every state change while open.
   * `redraw` lets the panel refresh itself after local UI changes (tabs, toggles).
   */
  render: (redraw: () => void) => HTMLElement[];
}

const PHONE_MAX_WIDTH = 640;
const POPOVER_GAP_PX = 6;

/**
 * Top bar resource buttons sharing one dropdown. Only one is open at a time;
 * it closes on a second click, a click outside or Escape.
 */
export class ResourceMenu {
  private openId: string | null = null;
  /** Item currently drawn in the popover, to tell a re-render from a switch. */
  private renderedId: string | null = null;
  private readonly buttons = new Map<string, HTMLButtonElement>();
  private readonly values = new Map<string, { full: HTMLElement; compact: HTMLElement }>();

  constructor(
    private readonly popover: HTMLElement,
    private readonly store: GameStore,
    private readonly items: readonly ResourceMenuItem[],
  ) {
    popover.id ||= 'resource-popover';
    // pointerdown runs before any click handler re-renders the popover, so the target is
    // still attached. Capture phase: the Phaser canvas stops pointer events from bubbling.
    document.addEventListener('pointerdown', (event) => this.closeIfOutside(event), {
      capture: true,
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.openId) this.close({ restoreFocus: true });
    });
    window.addEventListener('resize', () => this.position());
  }

  /** Builds the top bar buttons and keeps them (and the open dropdown) in sync. */
  mount(catalog: Catalog, session: MasterAccess): HTMLElement {
    const list = el(
      'ul',
      { class: 'topbar__resources' },
      ...this.items.map((item) => el('li', {}, this.trigger(catalog, item))),
    );
    const refresh = () => {
      this.renderSummaries();
      this.renderPopover();
    };
    this.store.subscribe(refresh);
    session.subscribe(refresh);
    this.renderSummaries();
    return list;
  }

  close({ restoreFocus = false } = {}): void {
    const wasOpen = this.openId;
    this.openId = null;
    this.renderPopover();
    if (restoreFocus && wasOpen) this.buttons.get(wasOpen)?.focus();
  }

  private toggle(id: string): void {
    this.openId = this.openId === id ? null : id;
    this.renderPopover();
  }

  private trigger(catalog: Catalog, item: ResourceMenuItem): HTMLButtonElement {
    const full = el('span', { class: 'resource__amount' });
    const compact = el('span', { class: 'resource__amount resource__amount--compact' });
    const node = el(
      'button',
      {
        class: 'resource',
        type: 'button',
        title: item.label,
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
        'aria-controls': this.popover.id,
        onclick: () => this.toggle(item.id),
      },
      thumb({ catalog }, { image: item.icon, name: item.label }),
      el('span', { class: 'resource__name' }, item.label),
      full,
      compact,
    );
    this.buttons.set(item.id, node);
    this.values.set(item.id, { full, compact });
    return node;
  }

  private renderSummaries(): void {
    const state = this.store.current;
    this.items.forEach((item) => {
      const value = this.values.get(item.id);
      if (!value) return;
      value.full.textContent = item.summary(state);
      value.compact.textContent = item.compactSummary(state);
    });
  }

  private renderPopover(): void {
    const item = this.items.find((i) => i.id === this.openId);
    this.buttons.forEach((node, id) => node.setAttribute('aria-expanded', String(id === item?.id)));
    this.popover.hidden = !item;
    const sameView = item !== undefined && item.id === this.renderedId;
    this.renderedId = item?.id ?? null;
    if (!item) return;
    this.popover.setAttribute('aria-label', item.label);
    replaceKeepingScroll(
      this.popover,
      item.render(() => this.renderPopover()),
      { sameView },
    );
    this.position();
  }

  /** Under its button on wide screens; full width under the top bar on phones (via CSS). */
  private position(): void {
    const anchor = this.openId ? this.buttons.get(this.openId) : undefined;
    if (!anchor || this.popover.hidden) return;
    if (window.innerWidth <= PHONE_MAX_WIDTH) {
      this.popover.style.removeProperty('left');
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - this.popover.offsetWidth - POPOVER_GAP_PX;
    this.popover.style.left = `${Math.max(POPOVER_GAP_PX, Math.min(rect.left, maxLeft))}px`;
  }

  private closeIfOutside(event: PointerEvent): void {
    const target = event.target;
    if (!this.openId || !(target instanceof Node)) return;
    // A modal opened from the dropdown (the photo crop) sits on top of it: clicks there stay inside.
    const isInModal = target instanceof Element && target.closest('dialog[open]') !== null;
    const isInside =
      isInModal ||
      this.popover.contains(target) ||
      [...this.buttons.values()].some((node) => node.contains(target));
    if (!isInside) this.close();
  }
}
