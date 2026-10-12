import type { GameImages } from '../../gameImages';
import { t } from '../../i18n/pt-BR';
import type { ImageFiles } from '../../persistence/ArchiveImageStore';
import type { ImageFormat } from '../../systems/Archive';
import { ACCEPTED_IMAGE_TYPES } from '../../systems/ArchiveImages';
import {
  checkPhotoFile,
  checkStoredPhoto,
  looksLikeUpload,
  PHOTO_LIMITS,
  type CropRect,
  type ImageTarget,
  type PhotoError,
} from '../../systems/GameImages';
import { decodeImage, encodeImage } from '../archive/imageCompression';
import { listenForFiles } from '../archive/imageAttachments';
import { el } from '../dom';
import { button, thumb, type Act, type ImageSource } from '../widgets';
import { cropPhoto } from './cropDialog';

export interface PhotoFieldDeps {
  source: ImageSource & { images: GameImages };
  /** The photo saved now: an upload, an asset key or a URL; empty for none. */
  current: string | undefined;
  /** For the placeholder: the initial and the color, as everywhere else. */
  name: string;
  color?: string | undefined;
}

export interface PhotoField {
  element: HTMLElement;
  /** Takes dropped and pasted images anywhere in `target` (the whole form). */
  listenOn(target: HTMLElement): void;
  /**
   * The value to save for `target`: a photo picked here is uploaded first.
   * Null when the upload failed (already reported) or one is under way.
   */
  commit(target: ImageTarget): Promise<string | null>;
  /** The save was refused: the photo just uploaded never reached the game. */
  rollback(): Promise<void>;
}

/** A picked photo, cropped and compressed, waiting for the form to be saved. */
interface Picked {
  files: ImageFiles;
  format: ImageFormat;
  previewUrl: string;
}

/**
 * Photo picker of the NPC, material, character and world forms: round
 * preview, "Enviar foto", drag and drop, Ctrl+V and "Remover foto". The photo
 * is only uploaded when the form is saved, so a form left alone leaves no file.
 * A discreet link switches to the old text field (asset key or URL).
 */
export function photoField(deps: PhotoFieldDeps): PhotoField {
  let value = deps.current ?? '';
  let picked: Picked | null = null;
  let uploaded: string | null = null;
  let isBusy = false;
  let isTyping = !looksLikeUpload(value) && value !== '';

  const preview = el('span', { class: 'photo-field__preview' });
  const status = el('p', { class: 'panel__hint', 'aria-live': 'polite' });
  const say = (message: string, isError = false) => {
    status.textContent = message;
    status.classList.toggle('reasons', isError);
  };
  const text = el('input', {
    class: 'input input--wide',
    value: looksLikeUpload(value) ? '' : value,
    'aria-label': t.photos.textLabel,
    placeholder: t.photos.textLabel,
  });
  const picker = el('input', {
    type: 'file',
    accept: ACCEPTED_IMAGE_TYPES.join(','),
    hidden: true,
  });
  const remove = button(t.photos.remove, () => choose(null, ''));
  const toggle = el('button', { class: 'link-button', type: 'button' });
  const uploadControls = el(
    'div',
    { class: 'photo-field__controls' },
    el(
      'div',
      { class: 'row row--wrap' },
      button(t.photos.send, () => picker.click()),
      remove,
    ),
    el('p', { class: 'panel__hint' }, t.photos.hint),
  );

  const render = () => {
    const image = picked ? undefined : value;
    preview.replaceChildren(
      picked
        ? el('img', { class: 'thumb thumb--lg', src: picked.previewUrl, alt: '' })
        : thumb(deps.source, { image, name: deps.name || '?', color: deps.color }, 'lg'),
    );
    remove.disabled = !picked && value === '';
    uploadControls.hidden = isTyping;
    text.hidden = !isTyping;
    toggle.textContent = isTyping ? t.photos.useUpload : t.photos.useText;
  };

  const choose = (next: Picked | null, nextValue: string) => {
    if (picked) URL.revokeObjectURL(picked.previewUrl);
    picked = next;
    value = nextValue;
    say(next ? t.photos.chosen : '');
    render();
  };

  const take = async (file: File) => {
    if (isBusy) return;
    isBusy = true;
    say(t.photos.preparing);
    const result = await preparePhoto(file).catch((error: unknown) => {
      console.error('[photos] could not prepare a photo', error);
      return 'unreadable' as const;
    });
    isBusy = false;
    say('');
    if (result === null) return;
    if (typeof result === 'string') {
      say(t.photos.refused(file.name || 'imagem', t.photos.errors[result]), true);
      return;
    }
    choose(result, value);
  };

  picker.addEventListener('change', () => {
    const [file] = picker.files ?? [];
    picker.value = '';
    if (file) void take(file);
  });
  text.addEventListener('input', () => choose(null, text.value));
  toggle.addEventListener('click', () => {
    isTyping = !isTyping;
    choose(null, isTyping ? text.value : looksLikeUpload(deps.current) ? (deps.current ?? '') : '');
  });

  const element = el(
    'div',
    { class: 'photo-field' },
    preview,
    el('div', { class: 'photo-field__body' }, uploadControls, text, toggle, status),
    picker,
  );
  render();

  return {
    element,
    listenOn: (target) =>
      listenForFiles(target, ([file]) => {
        if (file && !isTyping) void take(file);
      }),
    commit: async (target) => {
      if (isBusy) return null;
      if (!picked) return value.trim();
      isBusy = true;
      say(t.photos.sending);
      const ref = await deps.source.images.upload(target, picked.files, picked.format);
      isBusy = false;
      say('');
      if (ref) uploaded = ref;
      return ref;
    },
    rollback: async () => {
      if (!uploaded) return;
      await deps.source.images.discard(uploaded);
      uploaded = null;
    },
  };
}

/** Runs `save` with the photo's value once uploaded; a refused save drops the new file. */
export async function saveWithPhoto(
  photo: PhotoField,
  target: ImageTarget,
  save: (image: string) => boolean,
): Promise<void> {
  const image = await photo.commit(target);
  if (image === null) return;
  if (!save(image)) await photo.rollback();
}

/** A form holding only a photo: a player's own portrait, a world's icon. */
export function photoForm({
  target,
  act,
  close,
  ...field
}: PhotoFieldDeps & { target: ImageTarget; act: Act; close: () => void }): HTMLElement {
  const photo = photoField(field);
  const form = el(
    'form',
    {
      class: 'subform',
      onsubmit: (event: Event) => {
        event.preventDefault();
        void saveWithPhoto(photo, target, (image) => {
          const done = act({ type: 'set_image', target, image });
          if (done) close();
          return done;
        });
      },
    },
    photo.element,
    el(
      'div',
      { class: 'row row--end' },
      button(t.common.cancel, close),
      el('button', { class: 'btn btn--primary', type: 'submit' }, t.common.save),
    ),
  );
  photo.listenOn(form);
  return form;
}

/**
 * Checks the file, lets the user crop it square, then makes the 512 px photo
 * and its 128 px thumbnail. Null when the crop was cancelled.
 */
async function preparePhoto(file: File): Promise<Picked | PhotoError | null> {
  const error = checkPhotoFile(file);
  if (error) return error;
  const bitmap = await decodeImage(file);
  if (!bitmap) return 'unreadable';
  try {
    const rect = await cropPhoto(bitmap);
    if (!rect) return null;
    return await encodePhoto(bitmap, rect);
  } finally {
    bitmap.close();
  }
}

async function encodePhoto(bitmap: ImageBitmap, rect: CropRect): Promise<Picked | PhotoError> {
  const source = { x: rect.x, y: rect.y, width: rect.side, height: rect.side };
  const side = { width: PHOTO_LIMITS.side, height: PHOTO_LIMITS.side };
  const full = await encodeImage(bitmap, side, 'webp', source);
  const tooLarge = checkStoredPhoto(full.blob.size);
  if (tooLarge) return tooLarge;
  const thumbSide = { width: PHOTO_LIMITS.thumbSide, height: PHOTO_LIMITS.thumbSide };
  const small = await encodeImage(bitmap, thumbSide, full.format, source);
  return {
    files: { full: full.blob, thumb: small.blob },
    format: full.format,
    previewUrl: URL.createObjectURL(small.blob),
  };
}
