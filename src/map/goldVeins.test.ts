import { describe, expect, it } from 'vitest';
import {
  combineVeins,
  extractGoldMask,
  glitterNoise,
  goldStrength,
  rotatedCopies,
} from './goldVeins';

describe('goldStrength', () => {
  it.each([
    { label: 'bright gold', rgb: [0.85, 0.65, 0.25], gold: true },
    { label: 'black marble', rgb: [0.08, 0.08, 0.09], gold: false },
    { label: 'gray stone', rgb: [0.6, 0.6, 0.6], gold: false },
    { label: 'saturated blue', rgb: [0.2, 0.3, 0.9], gold: false },
  ])('scores $label as gold: $gold', ({ rgb: [r = 0, g = 0, b = 0], gold }) => {
    expect(goldStrength(r, g, b) > 0.5).toBe(gold);
  });
});

describe('vein masks', () => {
  const size = 9;
  const marble = {
    width: size,
    height: size,
    data: Uint8ClampedArray.from({ length: size * size * 4 }, (_, i) => {
      const pixel = Math.floor(i / 4);
      const isGold = pixel % size === 4; // one vertical gold line in the middle column
      const channel = i % 4;
      if (channel === 3) return 255;
      return isGold ? ([220, 170, 60][channel] ?? 0) : 20;
    }),
  };

  it('keeps the gold line and leaves the black marble out', () => {
    const mask = extractGoldMask(marble);
    expect(mask.values[4 * size + 4]).toBeGreaterThan(0.6);
    expect(mask.values[4 * size]).toBe(0);
  });

  it('adds rotated veins only where the copies are stronger', () => {
    const mask = extractGoldMask(marble);
    const combined = combineVeins(mask, rotatedCopies(mask), 0.9);
    const lit = (values: Float32Array) => values.filter((v) => v > 0.3).length;
    expect(lit(combined)).toBeGreaterThan(lit(mask.values));
    expect(combineVeins(mask, rotatedCopies(mask), 0)).toEqual(mask.values);
  });
});

describe('glitterNoise', () => {
  it('repeats for the same seed and stays in [0, 1)', () => {
    const a = glitterNoise(100);
    expect(glitterNoise(100)).toEqual(a);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
