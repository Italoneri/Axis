import { describe, expect, it } from 'vitest';
import { PAPERS, scrollLook } from './scrollLook';

describe('scrollLook', () => {
  it('gives the same id the same look every time', () => {
    expect(scrollLook('mission_ab12')).toEqual(scrollLook('mission_ab12'));
  });

  it('keeps tilt, drop and tears within bounds', () => {
    const looks = Array.from({ length: 200 }, (_, i) => scrollLook(`mission_${i}`));
    looks.forEach((look) => {
      expect(Math.abs(look.tiltDeg)).toBeLessThanOrEqual(3);
      expect(look.dropPx).toBeGreaterThanOrEqual(0);
      expect(look.dropPx).toBeLessThanOrEqual(22);
      expect(look.edge).toMatch(/^polygon\((\d+(\.\d)?% \d+(\.\d)?%, )+\d+(\.\d)?% \d+(\.\d)?%\)$/);
    });
  });

  it('spreads ids over every paper color', () => {
    const papers = new Set(Array.from({ length: 200 }, (_, i) => scrollLook(`mission_${i}`).paper));
    expect([...papers].sort()).toEqual([...PAPERS].sort());
  });
});
