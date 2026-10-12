import { t } from '../../i18n/pt-BR';
import type { ArchiveImage } from '../../systems/Archive';
import { el } from '../dom';

/**
 * An image whose URL arrives later (an object URL offline, a signed URL online).
 * A load that fails asks for a fresh URL once (a signed URL may have expired),
 * then shows a "missing" box instead of a broken image.
 */
export function remoteImage(
  loadUrl: () => Promise<string>,
  { className, alt }: { className: string; alt: string },
): HTMLElement {
  const frame = el('span', { class: `${className} archive-image is-loading` });
  let retried = false;
  const missing = () => {
    frame.className = `${className} archive-image archive-image--missing`;
    frame.replaceChildren(t.archive.images.missing);
  };
  const show = () =>
    loadUrl().then((url) => {
      const picture = new Image();
      picture.alt = alt;
      picture.decoding = 'async';
      picture.addEventListener('load', () => {
        frame.className = `${className} archive-image`;
        frame.replaceChildren(picture);
      });
      picture.addEventListener('error', () => {
        if (retried) return missing();
        retried = true;
        void show().catch(missing);
      });
      picture.src = url;
    });
  show().catch((error: unknown) => {
    console.warn('[archive] image unavailable', error);
    missing();
  });
  return frame;
}

export interface ImageStripDeps {
  url: (image: ArchiveImage, variant: 'full' | 'thumb') => Promise<string>;
  open: (index: number) => void;
}

/** The thumbnails under a note's text. */
export function imageStrip(images: readonly ArchiveImage[], deps: ImageStripDeps): HTMLElement {
  return el(
    'ul',
    { class: 'archive-images' },
    ...images.map((image, index) =>
      el(
        'li',
        { class: 'archive-images__item' },
        el(
          'button',
          {
            class: 'archive-images__open',
            type: 'button',
            'aria-label': t.archive.images.open(index + 1, images.length),
            onclick: () => deps.open(index),
          },
          remoteImage(() => deps.url(image, 'thumb'), {
            className: 'archive-images__thumb',
            alt: image.caption,
          }),
        ),
        image.caption && el('span', { class: 'archive-images__caption' }, image.caption),
      ),
    ),
  );
}

/**
 * Full screen view of a note's images: arrows (and ← →) pass between them,
 * a click or the zoom button shows the real size, Esc closes.
 */
export function openImageViewer(
  images: readonly ArchiveImage[],
  start: number,
  url: (image: ArchiveImage) => Promise<string>,
): void {
  let index = start;
  const figure = el('div', { class: 'archive-viewer__figure' });
  const caption = el('p', { class: 'archive-viewer__caption' });
  const position = el('span', { class: 'archive-viewer__position' });
  const zoom = el('button', { class: 'btn', type: 'button' });

  const setZoomed = (zoomed: boolean) => {
    figure.classList.toggle('is-zoomed', zoomed);
    zoom.textContent = zoomed ? t.archive.images.zoomOut : t.archive.images.zoomIn;
  };
  const show = () => {
    const image = images[index];
    if (!image) return;
    setZoomed(false);
    figure.replaceChildren(
      remoteImage(() => url(image), { className: 'archive-viewer__image', alt: image.caption }),
    );
    caption.textContent = image.caption;
    position.textContent = t.archive.images.position(index + 1, images.length);
  };
  const go = (step: number) => {
    index = (index + step + images.length) % images.length;
    show();
  };

  const hasMany = images.length > 1;
  const dialog = el(
    'dialog',
    { class: 'dialog dialog--viewer', 'aria-label': t.archive.images.viewer },
    el(
      'header',
      { class: 'archive-viewer__bar' },
      position,
      zoom,
      el(
        'button',
        {
          class: 'btn btn--icon',
          type: 'button',
          'aria-label': t.archive.images.close,
          onclick: () => dialog.close(),
        },
        '×',
      ),
    ),
    el(
      'div',
      { class: 'archive-viewer__stage' },
      hasMany && navButton('‹', t.archive.images.previous, () => go(-1)),
      figure,
      hasMany && navButton('›', t.archive.images.next, () => go(1)),
    ),
    caption,
  );
  zoom.addEventListener('click', () => setZoomed(!figure.classList.contains('is-zoomed')));
  figure.addEventListener('click', () => setZoomed(!figure.classList.contains('is-zoomed')));
  dialog.addEventListener('keydown', (event) => {
    // The archive window and the slot panel behind stay open.
    if (event.key === 'Escape') event.stopPropagation();
    if (event.key === 'ArrowLeft' && hasMany) go(-1);
    if (event.key === 'ArrowRight' && hasMany) go(1);
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  show();
  dialog.showModal();
}

function navButton(label: string, title: string, onClick: () => void): HTMLElement {
  return el(
    'button',
    { class: 'btn archive-viewer__nav', type: 'button', 'aria-label': title, onclick: onClick },
    label,
  );
}
