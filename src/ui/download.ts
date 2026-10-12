import { el } from './dom';

export function downloadText(fileName: string, text: string): void {
  downloadBlob(fileName, new Blob([text], { type: 'application/json' }));
}

export function downloadBlob(fileName: string, blob: Blob): void {
  const link = el('a', { href: URL.createObjectURL(blob), download: fileName });
  link.click();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
