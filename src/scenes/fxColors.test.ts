import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SMOKE_TINT,
  DEFAULT_SPARK_TINTS,
  hexToTint,
  lighten,
  smokeTint,
  sparkTints,
} from './fxColors';

describe('fx colors', () => {
  it('reads hex colors as tints', () => {
    expect(hexToTint('#7dffa0')).toBe(0x7dffa0);
  });

  it('lightens towards white', () => {
    expect(lighten(0x000000, 0.5)).toBe(0x808080);
    expect(lighten(0x123456, 0)).toBe(0x123456);
    expect(lighten(0x123456, 1)).toBe(0xffffff);
  });

  it('keeps the defaults when no color is given', () => {
    expect(smokeTint()).toBe(DEFAULT_SMOKE_TINT);
    expect(sparkTints()).toEqual(DEFAULT_SPARK_TINTS);
  });

  it('uses the given color and lighter shades of it', () => {
    expect(smokeTint('#7dffa0')).toBe(0x7dffa0);
    const [base, mid, light] = sparkTints('#b48cff');
    expect(base).toBe(0xb48cff);
    expect(mid).toBe(lighten(0xb48cff, 0.35));
    expect(light).toBe(lighten(0xb48cff, 0.7));
  });
});
