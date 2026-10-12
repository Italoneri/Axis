import { el } from './dom';

const VISIBLE_MS = 3500;
const MAX_VISIBLE = 4;

export function showToast(
  root: HTMLElement,
  message: string,
  tone: 'info' | 'error' = 'info',
): void {
  const toast = el('div', { class: tone === 'error' ? 'toast toast--error' : 'toast' }, message);
  root.append(toast);
  while (root.children.length > MAX_VISIBLE) root.firstElementChild?.remove();
  raiseAboveDialogs(root);
  setTimeout(() => toast.remove(), VISIBLE_MS);
}

/**
 * A modal <dialog> (the Arquivo, the menu) sits in the top layer, above any
 * z-index. Re-showing the toasts as a popover puts them in the top layer too,
 * after the newest dialog, so a refusal is seen while a window is open.
 */
function raiseAboveDialogs(root: HTMLElement): void {
  if (!root.hasAttribute('popover')) return;
  if (root.matches(':popover-open')) root.hidePopover();
  root.showPopover();
}
