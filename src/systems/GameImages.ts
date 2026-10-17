import type { Catalog } from '../model/catalog';
import type { GameState } from '../model/schema';
import type { ImageRef } from '../persistence/ArchiveImageStore';
import type { ImageFormat } from './Archive';
import { ACCEPTED_IMAGE_TYPES, IMAGE_LIMITS } from './ArchiveImages';
import { fail, ok, type Outcome } from './outcome';

// Photos sent in game for characters, NPCs, materials and worlds. The state
// keeps only a reference (`upload:<kind>/<id>/<image>.<format>`) in the same
// field as asset keys and URLs; the files live apart (IndexedDB offline, the
// private game-images bucket online), under `<kind>/<id>/`, so the Storage
// policies can tell a player's own character from everything else.

export const IMAGE_KINDS = ['character', 'npc', 'material', 'world', 'shop_item'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/** The record a photo belongs to. */
export interface ImageTarget {
  kind: ImageKind;
  id: string;
}

export interface UploadRef {
  target: ImageTarget;
  imageId: string;
  format: ImageFormat;
}

export const PHOTO_LIMITS = {
  /** Stored square side, and the side of the small one shown in lists. */
  side: 512,
  thumbSide: 128,
  /** What is stored after compression (the bucket enforces it too). */
  storedBytes: 300 * 1024,
  quality: 0.85,
  /** How far the crop can zoom in on the picked image. */
  maxZoom: 4,
} as const;

/** Why a picked, dropped or pasted file did not become a photo. */
export type PhotoError =
  'unsupported_format' | 'file_too_large' | 'unreadable' | 'compressed_too_large';

/** JPG, PNG, WebP or GIF (kept as its first frame), up to 10 MB, before anything is decoded. */
export function checkPhotoFile(file: { type: string; size: number }): PhotoError | null {
  if (!ACCEPTED_IMAGE_TYPES.some((type) => type === file.type)) return 'unsupported_format';
  if (file.size > IMAGE_LIMITS.originalBytes) return 'file_too_large';
  return null;
}

/** The compressed photo, before it is stored. */
export function checkStoredPhoto(bytes: number): PhotoError | null {
  return bytes > PHOTO_LIMITS.storedBytes ? 'compressed_too_large' : null;
}

const UPLOAD_PREFIX = 'upload:';
const UPLOAD_PATTERN =
  /^upload:(character|npc|material|world|shop_item)\/([A-Za-z0-9_-]{1,64})\/([a-z0-9_-]{1,64})\.(webp|jpeg)$/;

export function uploadRef({ target, imageId, format }: UploadRef): string {
  return `${UPLOAD_PREFIX}${target.kind}/${target.id}/${imageId}.${format}`;
}

/** Where the file stores keep it: the record's folder, `<kind>/<id>`, takes the place of a note id. */
export function fileRef({ target, imageId, format }: UploadRef): ImageRef {
  return { noteId: `${target.kind}/${target.id}`, image: { id: imageId, format } };
}

/** Anything claiming to be an upload, valid or not: never shown as an asset key or URL. */
export function looksLikeUpload(ref: string | undefined): ref is string {
  return ref?.startsWith(UPLOAD_PREFIX) ?? false;
}

export function parseUploadRef(ref: string | undefined): UploadRef | null {
  const match = ref ? UPLOAD_PATTERN.exec(ref) : null;
  if (!match) return null;
  const [, kind, id, imageId, format] = match;
  if (!isImageKind(kind) || !id || !imageId || (format !== 'webp' && format !== 'jpeg')) {
    return null;
  }
  return { target: { kind, id }, imageId, format };
}

function isImageKind(value: string | undefined): value is ImageKind {
  return IMAGE_KINDS.some((kind) => kind === value);
}

/** An upload may only sit on the record whose folder holds it. */
export function isUploadFor(ref: string, target: ImageTarget): boolean {
  const upload = parseUploadRef(ref);
  return upload !== null && upload.target.kind === target.kind && upload.target.id === target.id;
}

/** The photo field of a record: portrait, icon, or the world icon kept in the save. */
export function imageOf(
  state: GameState,
  catalog: Catalog,
  target: ImageTarget,
): string | undefined {
  switch (target.kind) {
    case 'character':
      return state.characters.find((c) => c.id === target.id)?.portrait;
    case 'npc':
      return state.npcs.find((n) => n.id === target.id)?.portrait;
    case 'material':
      return state.materials.items.find((m) => m.id === target.id)?.icon;
    case 'world':
      return state.worldIcons?.[target.id] ?? catalog.worlds.find((w) => w.id === target.id)?.icon;
    case 'shop_item':
      return state.shop.items.find((i) => i.id === target.id)?.image;
  }
}

/**
 * Sets or clears (empty `image`) the photo of one record. Not logged: it is
 * cosmetic, and the photo itself shows the change.
 */
export function setImage(
  state: GameState,
  catalog: Catalog,
  target: ImageTarget,
  image: string | undefined,
): Outcome {
  const value = image?.trim() || undefined;
  if (!recordExists(state, catalog, target)) return fail('not_found');
  if (imageOf(state, catalog, target) === value) return ok(state);
  return ok(withImage(state, target, value));
}

function recordExists(state: GameState, catalog: Catalog, { kind, id }: ImageTarget): boolean {
  const records: Record<ImageKind, readonly { id: string }[]> = {
    character: state.characters,
    npc: state.npcs,
    material: state.materials.items,
    world: catalog.worlds,
    shop_item: state.shop.items,
  };
  return records[kind].some((record) => record.id === id);
}

function withImage(
  state: GameState,
  { kind, id }: ImageTarget,
  image: string | undefined,
): GameState {
  const edit = <T extends { id: string }>(records: readonly T[], change: (record: T) => void) =>
    records.map((record) => {
      if (record.id !== id) return record;
      const copy = { ...record };
      change(copy);
      return copy;
    });
  switch (kind) {
    case 'character':
      return {
        ...state,
        characters: edit(state.characters, (c) => {
          if (image) c.portrait = image;
          else delete c.portrait;
        }),
      };
    case 'npc':
      return {
        ...state,
        npcs: edit(state.npcs, (n) => {
          if (image) n.portrait = image;
          else delete n.portrait;
        }),
      };
    case 'material': {
      const items = edit(state.materials.items, (m) => {
        if (image) m.icon = image;
        else delete m.icon;
      });
      return { ...state, materials: { ...state.materials, items } };
    }
    case 'shop_item': {
      const items = edit(state.shop.items, (i) => {
        if (image) i.image = image;
        else delete i.image;
      });
      return { ...state, shop: { ...state.shop, items } };
    }
    case 'world': {
      const others = Object.entries(state.worldIcons ?? {}).filter(([worldId]) => worldId !== id);
      const icons = Object.fromEntries(image ? [...others, [id, image]] : others);
      return { ...state, worldIcons: icons };
    }
  }
}

/** Every uploaded photo the game refers to. */
export function uploadsOf(state: GameState): UploadRef[] {
  const refs = [
    ...state.characters.map((c) => c.portrait),
    ...state.npcs.map((n) => n.portrait),
    ...state.materials.items.map((m) => m.icon),
    ...state.shop.items.map((i) => i.image),
    ...Object.values(state.worldIcons ?? {}),
  ];
  return refs.map(parseUploadRef).filter((ref) => ref !== null);
}

/** Photos `before` had and `after` lost (replaced, removed, or their record gone): their files can go. */
export function droppedUploads(before: GameState, after: GameState): UploadRef[] {
  const kept = new Set(uploadsOf(after).map(uploadRef));
  return uploadsOf(before).filter((ref) => !kept.has(uploadRef(ref)));
}

// ---------------------------------------------------------------- the square crop

export interface Size {
  width: number;
  height: number;
}

/** What the crop dialog shows: a zoom (1 = the whole short side) around a center, in image pixels. */
export interface CropView {
  zoom: number;
  centerX: number;
  centerY: number;
}

/** The square of the image that becomes the photo. */
export interface CropRect {
  x: number;
  y: number;
  side: number;
}

/** The largest centered square: what a photo becomes before any drag or zoom. */
export function centerView({ width, height }: Size): CropView {
  return { zoom: 1, centerX: width / 2, centerY: height / 2 };
}

/** Keeps the zoom in range and the square inside the image. */
export function clampView(size: Size, view: CropView): CropView {
  const zoom = Math.min(PHOTO_LIMITS.maxZoom, Math.max(1, finiteOr(view.zoom, 1)));
  const half = Math.min(size.width, size.height) / zoom / 2;
  const clamp = (value: number, max: number) =>
    Math.min(max - half, Math.max(half, finiteOr(value, max / 2)));
  return {
    zoom,
    centerX: clamp(view.centerX, size.width),
    centerY: clamp(view.centerY, size.height),
  };
}

export function cropRect(size: Size, view: CropView): CropRect {
  const { zoom, centerX, centerY } = clampView(size, view);
  const side = Math.min(size.width, size.height) / zoom;
  return { x: centerX - side / 2, y: centerY - side / 2, side };
}

/** Dragging the picture by (dx, dy) screen pixels on a stage `stageSide` wide moves the square the other way. */
export function panView(
  size: Size,
  view: CropView,
  { dx, dy, stageSide }: { dx: number; dy: number; stageSide: number },
): CropView {
  const scale = cropRect(size, view).side / stageSide;
  return clampView(size, {
    ...view,
    centerX: view.centerX - dx * scale,
    centerY: view.centerY - dy * scale,
  });
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
