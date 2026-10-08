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
  setTimeout(() => toast.remove(), VISIBLE_MS);
}
