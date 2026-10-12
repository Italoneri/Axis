import type { ArchiveStore } from '../../archiveStore';
import { newId } from '../../commands/newId';
import { t } from '../../i18n/pt-BR';
import type { ArchiveImage } from '../../systems/Archive';
import { ACCEPTED_IMAGE_TYPES, IMAGE_LIMITS } from '../../systems/ArchiveImages';
import { el } from '../dom';
import { button } from '../widgets';
import { prepareImage } from './imageCompression';
import { remoteImage } from './imageViews';

export interface AttachmentsDeps {
  noteId: string;
  /** Images already saved with the note. */
  saved: readonly ArchiveImage[];
  archive: ArchiveStore;
  notify: (message: string, tone?: 'error') => void;
  /** Removing an image already saved takes effect at once, before the note is saved. */
  removeSaved: (imageId: string) => Promise<boolean>;
}

export interface AttachmentsEditor {
  element: HTMLElement;
  /** The images in their current order, with the captions typed. */
  images(): ArchiveImage[];
  isBusy(): boolean;
  /** Takes picked, dropped and pasted images from `target` (the whole editor). */
  listenOn(target: HTMLElement): void;
  /** Drops the files uploaded for images the note never saved (the editor was cancelled). */
  discardUnsaved(): Promise<void>;
}

interface Item {
  image: ArchiveImage;
  isSaved: boolean;
  caption: HTMLInputElement;
  /** Object URL of a fresh upload's thumbnail, released when it goes. */
  localUrl?: string;
}

/**
 * The images section of the note editor. Files are checked, compressed and
 * uploaded as soon as they arrive, so saving the note only writes metadata.
 */
export function attachmentsEditor(deps: AttachmentsDeps): AttachmentsEditor {
  const items: Item[] = deps.saved.map((image) => ({
    image,
    isSaved: true,
    caption: captionInput(image.caption),
  }));
  let pending = 0;
  const list = el('ul', { class: 'archive-attachments__list' });
  const status = el('p', { class: 'panel__hint', 'aria-live': 'polite' });
  const picker = el('input', {
    type: 'file',
    accept: ACCEPTED_IMAGE_TYPES.join(','),
    multiple: true,
    hidden: true,
  });
  picker.addEventListener('change', () => {
    const files = [...(picker.files ?? [])];
    picker.value = '';
    void addFiles(files);
  });

  const render = () => {
    list.replaceChildren(...items.map((item, index) => itemRow(item, index)));
    status.textContent = pending > 0 ? t.archive.images.uploading(pending) : '';
  };

  const itemRow = (item: Item, index: number): HTMLElement => {
    const preview = item.localUrl
      ? el('img', { class: 'archive-attachments__thumb', src: item.localUrl, alt: '' })
      : remoteImage(() => deps.archive.imageUrl(deps.noteId, item.image, 'thumb'), {
          className: 'archive-attachments__thumb',
          alt: '',
        });
    return el(
      'li',
      { class: 'archive-attachments__item' },
      preview,
      el(
        'label',
        { class: 'archive-attachments__caption' },
        t.archive.images.caption,
        item.caption,
      ),
      el(
        'div',
        { class: 'row' },
        button('↑', () => move(index, -1), { title: t.archive.images.moveUp }),
        button('↓', () => move(index, 1), { title: t.archive.images.moveDown }),
        button('×', () => void remove(item), { title: t.archive.images.remove }),
      ),
    );
  };

  const move = (index: number, step: -1 | 1) => {
    const target = index + step;
    const item = items[index];
    const other = items[target];
    if (!item || !other) return;
    items[index] = other;
    items[target] = item;
    render();
  };

  const remove = async (item: Item) => {
    if (item.isSaved && !(await deps.removeSaved(item.image.id))) return;
    if (!item.isSaved) await deps.archive.discardImages(deps.noteId, [item.image]);
    if (item.localUrl) URL.revokeObjectURL(item.localUrl);
    items.splice(items.indexOf(item), 1);
    render();
  };

  // One file at a time, even across drops and pastes: each one is counted
  // against the limit with the ones before it.
  let queue = Promise.resolve();
  const addFiles = (files: readonly File[]) => {
    pending += files.length;
    render();
    const work = files.map((file) => async () => {
      // A failure (a canvas that cannot encode) must not stall the files after it.
      await addFile(file).catch((error: unknown) => {
        console.error('[archive] could not attach image', error);
        const reason = t.archive.images.errors.unreadable;
        deps.notify(t.archive.images.refused(file.name || 'imagem', reason), 'error');
      });
      pending -= 1;
      render();
    });
    queue = work.reduce((chain, step) => chain.then(step), queue);
    return queue;
  };

  const addFile = async (file: File) => {
    const prepared = await prepareImage(file, items.length);
    if (!prepared.ok) {
      const reason = t.archive.images.errors[prepared.error];
      deps.notify(t.archive.images.refused(file.name || 'imagem', reason), 'error');
      return;
    }
    const { files, ...meta } = prepared.image;
    const image: ArchiveImage = { id: newId('img'), caption: '', ...meta };
    if (!(await deps.archive.uploadImage(deps.noteId, image, files))) return;
    items.push({
      image,
      isSaved: false,
      caption: captionInput(''),
      localUrl: URL.createObjectURL(files.thumb),
    });
  };

  const element = el(
    'section',
    { class: 'archive-attachments' },
    el(
      'div',
      { class: 'row archive-attachments__bar' },
      el('span', {}, t.archive.images.title),
      button(t.archive.images.attach, () => picker.click()),
    ),
    el('p', { class: 'panel__hint' }, t.archive.images.hint),
    list,
    status,
    picker,
  );
  render();

  return {
    element,
    images: () => items.map((item) => ({ ...item.image, caption: item.caption.value })),
    isBusy: () => pending > 0,
    listenOn: (target) => listenForFiles(target, (files) => void addFiles(files)),
    discardUnsaved: async () => {
      const unsaved = items.filter((item) => !item.isSaved);
      unsaved.forEach((item) => item.localUrl && URL.revokeObjectURL(item.localUrl));
      await deps.archive.discardImages(
        deps.noteId,
        unsaved.map((item) => item.image),
      );
    },
  };
}

function captionInput(value: string): HTMLInputElement {
  return el('input', {
    class: 'input input--wide',
    type: 'text',
    maxlength: String(IMAGE_LIMITS.captionLength),
    value,
  });
}

/** Drag and drop onto the editor, and Ctrl+V of a copied image (a Discord print). */
function listenForFiles(target: HTMLElement, onFiles: (files: File[]) => void): void {
  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
  target.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    target.classList.add('is-dropping');
  });
  target.addEventListener('dragleave', () => target.classList.remove('is-dropping'));
  target.addEventListener('drop', (event) => {
    target.classList.remove('is-dropping');
    if (!hasFiles(event)) return;
    event.preventDefault();
    onFiles([...(event.dataTransfer?.files ?? [])]);
  });
  target.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    // Pasted text still goes into the text box; only images are taken here.
    event.preventDefault();
    onFiles(files);
  });
}
