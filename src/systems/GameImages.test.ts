import { describe, expect, it } from 'vitest';
import { resolveImage } from '../model/catalog';
import {
  centerView,
  clampView,
  cropRect,
  droppedUploads,
  isUploadFor,
  looksLikeUpload,
  panView,
  parseUploadRef,
  uploadRef,
  uploadsOf,
} from './GameImages';
import { makeState, npc, testCatalog } from './testFixtures';

describe('upload references', () => {
  it('round-trips a reference', () => {
    const ref = {
      target: { kind: 'npc', id: 'npc_ab12' },
      imageId: 'img_9f',
      format: 'webp',
    } as const;
    expect(uploadRef(ref)).toBe('upload:npc/npc_ab12/img_9f.webp');
    expect(parseUploadRef(uploadRef(ref))).toEqual(ref);
  });

  it.each([
    'upload:npc/a/b.png',
    'upload:dragon/a/b.webp',
    'upload:npc/../b.webp',
    'upload:npc/a/b',
    'upload:npc/a/B C.webp',
    'npc/a/b.webp',
    '',
  ])('refuses %j', (ref) => {
    expect(parseUploadRef(ref)).toBeNull();
  });

  it('ties an upload to its record', () => {
    const ref = 'upload:character/thorin/img_1.jpeg';
    expect(isUploadFor(ref, { kind: 'character', id: 'thorin' })).toBe(true);
    expect(isUploadFor(ref, { kind: 'character', id: 'lyra' })).toBe(false);
    expect(isUploadFor(ref, { kind: 'npc', id: 'thorin' })).toBe(false);
  });

  it('leaves uploads to the photo store and keeps old references resolving', () => {
    const upload = 'upload:npc/a/img_1.webp';
    expect(looksLikeUpload(upload)).toBe(true);
    expect(resolveImage(testCatalog, upload)).toBeUndefined();
    expect(resolveImage(testCatalog, 'https://example.com/a.png')).toBe(
      'https://example.com/a.png',
    );
    expect(looksLikeUpload('https://example.com/a.png')).toBe(false);
  });
});

describe('droppedUploads', () => {
  const photo = (id: string) => `upload:npc/${id}/img_${id}.webp`;
  const before = {
    ...makeState(),
    npcs: [
      npc({ id: 'a', name: 'A', portrait: photo('a') }),
      npc({ id: 'b', name: 'B', portrait: photo('b') }),
      npc({ id: 'c', name: 'C', portrait: 'https://example.com/c.png' }),
    ],
    worldIcons: { human: 'upload:world/human/img_h.webp' },
  };

  it('lists every upload the game refers to', () => {
    expect(uploadsOf(before).map(uploadRef)).toEqual([
      photo('a'),
      photo('b'),
      'upload:world/human/img_h.webp',
    ]);
  });

  it('finds photos replaced, cleared or whose record is gone', () => {
    const after = {
      ...before,
      npcs: [npc({ id: 'a', name: 'A', portrait: 'upload:npc/a/img_new.webp' })],
      worldIcons: {},
    };
    expect(droppedUploads(before, after).map(uploadRef)).toEqual([
      photo('a'),
      photo('b'),
      'upload:world/human/img_h.webp',
    ]);
  });

  it('finds nothing when the photos stay', () => {
    expect(droppedUploads(before, { ...before, day: 9 })).toEqual([]);
  });
});

describe('square crop', () => {
  const landscape = { width: 1200, height: 800 };

  it('starts on the largest centered square', () => {
    expect(cropRect(landscape, centerView(landscape))).toEqual({ x: 200, y: 0, side: 800 });
  });

  it('zooms in around the center', () => {
    const view = { ...centerView(landscape), zoom: 2 };
    expect(cropRect(landscape, view)).toEqual({ x: 400, y: 200, side: 400 });
  });

  it.each([
    { name: 'past the left edge', view: { zoom: 1, centerX: 0, centerY: 400 }, x: 0, y: 0 },
    { name: 'past the right edge', view: { zoom: 1, centerX: 9999, centerY: 400 }, x: 400, y: 0 },
    { name: 'zoomed past the corner', view: { zoom: 4, centerX: -50, centerY: 9999 }, x: 0, y: 600 },
  ])('keeps the square inside the image $name', ({ view, x, y }) => {
    const rect = cropRect(landscape, view);
    expect([rect.x, rect.y]).toEqual([x, y]);
  });

  it.each([
    { zoom: 0.2, side: 800 },
    { zoom: 10, side: 200 },
    { zoom: Number.NaN, side: 800 },
  ])('bounds a zoom of $zoom', ({ zoom, side }) => {
    expect(cropRect(landscape, { ...centerView(landscape), zoom }).side).toBe(side);
  });

  it('moves the square against the drag, at the scale of the stage', () => {
    // 800 image pixels shown on a 200 px stage: one screen pixel is 4 image pixels.
    const view = panView(landscape, centerView(landscape), { dx: 25, dy: 0, stageSide: 200 });
    expect(cropRect(landscape, view)).toEqual({ x: 100, y: 0, side: 800 });
    expect(clampView(landscape, view)).toEqual(view);
  });

  it('handles portrait images and tiny ones alike', () => {
    expect(cropRect({ width: 300, height: 900 }, centerView({ width: 300, height: 900 }))).toEqual(
      { x: 0, y: 300, side: 300 },
    );
    expect(cropRect({ width: 1, height: 1 }, centerView({ width: 1, height: 1 }))).toEqual({
      x: 0,
      y: 0,
      side: 1,
    });
  });
});
