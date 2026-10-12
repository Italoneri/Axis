import { describe, expect, it } from 'vitest';
import { checkImageFile, fitWithin, IMAGE_LIMITS } from './ArchiveImages';

const MB = 1024 * 1024;

describe('checkImageFile', () => {
  it.each([
    { type: 'image/jpeg', size: MB, already: 0, error: null },
    { type: 'image/png', size: MB, already: 11, error: null },
    { type: 'image/webp', size: 10 * MB, already: 0, error: null },
    { type: 'image/gif', size: MB, already: 0, error: null },
    { type: 'image/svg+xml', size: MB, already: 0, error: 'unsupported_format' },
    { type: 'application/pdf', size: MB, already: 0, error: 'unsupported_format' },
    { type: 'image/jpeg', size: 10 * MB + 1, already: 0, error: 'file_too_large' },
    { type: 'image/jpeg', size: MB, already: IMAGE_LIMITS.perNote, error: 'too_many_images' },
  ])(
    'answers $error for $type of $size bytes with $already attached',
    ({ type, size, already, error }) => {
      expect(checkImageFile({ type, size }, already)).toBe(error);
    },
  );
});

describe('fitWithin', () => {
  it.each([
    { from: [4000, 3000], to: [2000, 1500] },
    { from: [3000, 4000], to: [1500, 2000] },
    { from: [1200, 800], to: [1200, 800] },
    { from: [2000, 10], to: [2000, 10] },
    { from: [9000, 3], to: [2000, 1] },
  ])('fits $from into $to', ({ from: [w = 0, h = 0], to }) => {
    const fitted = fitWithin(w, h, 2000);
    expect([fitted.width, fitted.height]).toEqual(to);
  });

  it('makes thumbnails of about 320 px', () => {
    expect(fitWithin(2000, 1500, IMAGE_LIMITS.thumbSide)).toEqual({ width: 320, height: 240 });
  });
});
