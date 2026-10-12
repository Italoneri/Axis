import { describe, expect, it } from 'vitest';
import { clampAxis, coveredInsets, revealShift, usefulOffset } from './cameraMath';

const WORLD = 1000;

describe('clampAxis', () => {
  // The rule does not depend on the zoom: a map smaller than the view (zoom 0.5)
  // and one larger (zoom 4) both pan until an edge reaches the useful centre.
  it.each([
    { name: 'map smaller than the view', zoom: 0.5 },
    { name: 'map larger than the view', zoom: 4 },
  ])('pans the whole map on an axis ($name)', ({ zoom }) => {
    const offset = usefulOffset(0, 0, zoom);
    expect(clampAxis(300, WORLD, offset)).toBe(300);
    expect(clampAxis(-50, WORLD, offset)).toBe(0);
    expect(clampAxis(1200, WORLD, offset)).toBe(WORLD);
  });

  it('lets the camera travel further when a panel covers the right side', () => {
    // A 400px panel on the right at zoom 2: the useful centre is 100 world units left.
    const offset = usefulOffset(0, 400, 2);
    expect(offset).toBe(-100);
    expect(clampAxis(1200, WORLD, offset)).toBe(1100);
    expect(clampAxis(-50, WORLD, offset)).toBe(100);
  });

  it('shifts the range the other way for a panel on the left', () => {
    const offset = usefulOffset(300, 0, 1);
    expect(clampAxis(-500, WORLD, offset)).toBe(-150);
    expect(clampAxis(2000, WORLD, offset)).toBe(850);
  });
});

describe('coveredInsets', () => {
  const canvas = { left: 0, top: 56, right: 1536, bottom: 730 };

  it('reads a tall panel as a side inset', () => {
    const panel = { left: 1144, top: 68, right: 1524, bottom: 718 };
    expect(coveredInsets(canvas, [panel])).toEqual({ top: 0, right: 392, bottom: 0, left: 0 });
  });

  it('reads the phone sheet as a bottom inset', () => {
    const phone = { left: 0, top: 56, right: 390, bottom: 844 };
    const sheet = { left: 8, top: 400, right: 382, bottom: 836 };
    expect(coveredInsets(phone, [sheet])).toEqual({ top: 0, right: 0, bottom: 444, left: 0 });
  });

  it('combines the drawer on the left with the panel on the right and skips hidden ones', () => {
    const drawer = { left: 12, top: 68, right: 392, bottom: 718 };
    const panel = { left: 1144, top: 68, right: 1524, bottom: 718 };
    const hidden = { left: 0, top: 0, right: 0, bottom: 0 };
    expect(coveredInsets(canvas, [drawer, panel, hidden])).toEqual({
      top: 0,
      right: 392,
      bottom: 0,
      left: 392,
    });
  });
});

describe('revealShift', () => {
  it.each([
    { point: 500, shift: 0 },
    { point: 950, shift: 150 },
    { point: 20, shift: -80 },
  ])('moves $shift to show a point at $point', ({ point, shift }) => {
    expect(revealShift(point, 0, 900, 100)).toBe(shift);
  });

  it('centres the point when the range is narrower than the margins', () => {
    expect(revealShift(500, 0, 150, 100)).toBe(425);
  });
});
