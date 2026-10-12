import { t } from '../../i18n/pt-BR';
import {
  centerView,
  clampView,
  cropRect,
  panView,
  PHOTO_LIMITS,
  type CropRect,
  type CropView,
} from '../../systems/GameImages';
import { el } from '../dom';

const STAGE_SIDE = 256;
/** Screen pixels an arrow key moves the picture. */
const ARROW_STEP = 12;
const ARROW_MOVES: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [ARROW_STEP, 0],
  ArrowRight: [-ARROW_STEP, 0],
  ArrowUp: [0, ARROW_STEP],
  ArrowDown: [0, -ARROW_STEP],
};

/**
 * Square crop of a picked image: drag (or the arrows) to frame, the slider or
 * the wheel to zoom. The circle shows what thumbnails will show. Resolves to
 * the square in image pixels, or null when cancelled.
 */
export function cropPhoto(bitmap: ImageBitmap): Promise<CropRect | null> {
  const size = { width: bitmap.width, height: bitmap.height };
  let view: CropView = centerView(size);
  let chosen: CropRect | null = null;

  const canvas = el('canvas', {
    class: 'photo-crop__canvas',
    width: String(STAGE_SIDE * devicePixelRatio),
    height: String(STAGE_SIDE * devicePixelRatio),
    tabindex: '0',
    'aria-label': t.photos.crop.hint,
  });
  const zoom = el('input', {
    class: 'photo-crop__zoom',
    type: 'range',
    min: '1',
    max: String(PHOTO_LIMITS.maxZoom),
    step: '0.01',
    value: '1',
    'aria-label': t.photos.crop.zoom,
  });

  const paint = () => {
    const context = canvas.getContext('2d');
    if (!context) return;
    const rect = cropRect(size, view);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      rect.x,
      rect.y,
      rect.side,
      rect.side,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  };
  const setView = (next: CropView) => {
    view = clampView(size, next);
    zoom.value = String(view.zoom);
    paint();
  };
  const pan = (dx: number, dy: number) =>
    setView(panView(size, view, { dx, dy, stageSide: STAGE_SIDE }));

  listenForDrag(canvas, pan);
  zoom.addEventListener('input', () => setView({ ...view, zoom: Number(zoom.value) }));
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      setView({ ...view, zoom: view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) });
    },
    { passive: false },
  );
  canvas.addEventListener('keydown', (event) => {
    const move = ARROW_MOVES[event.key];
    if (!move) return;
    event.preventDefault();
    pan(...move);
  });

  const dialog = el(
    'dialog',
    { class: 'dialog dialog--crop', 'aria-label': t.photos.crop.title },
    el(
      'form',
      {
        method: 'dialog',
        onsubmit: () => {
          chosen = cropRect(size, view);
        },
      },
      el('h2', { class: 'panel__title' }, t.photos.crop.title),
      el('div', { class: 'photo-crop__stage' }, canvas),
      el('label', { class: 'field' }, t.photos.crop.zoom, zoom),
      el('p', { class: 'panel__hint' }, t.photos.crop.hint),
      el(
        'div',
        { class: 'row row--end' },
        el(
          'button',
          { class: 'btn', type: 'button', onclick: () => dialog.close() },
          t.common.cancel,
        ),
        el('button', { class: 'btn btn--primary', type: 'submit' }, t.photos.crop.confirm),
      ),
    ),
  );
  // Esc must not close the panel behind the dialog too.
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') event.stopPropagation();
  });

  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(chosen);
    });
    document.body.append(dialog);
    dialog.showModal();
    paint();
    canvas.focus();
  });
}

/** Pointer drags (mouse, touch, pen) reported as screen-pixel steps. */
function listenForDrag(target: HTMLElement, onMove: (dx: number, dy: number) => void): void {
  let last: { x: number; y: number } | null = null;
  target.addEventListener('pointerdown', (event) => {
    last = { x: event.clientX, y: event.clientY };
    target.setPointerCapture(event.pointerId);
  });
  target.addEventListener('pointermove', (event) => {
    if (!last) return;
    onMove(event.clientX - last.x, event.clientY - last.y);
    last = { x: event.clientX, y: event.clientY };
  });
  const stop = () => (last = null);
  target.addEventListener('pointerup', stop);
  target.addEventListener('pointercancel', stop);
}
