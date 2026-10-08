import { el } from './dom';

export function downloadText(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const link = el('a', { href: URL.createObjectURL(blob), download: fileName });
  link.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
