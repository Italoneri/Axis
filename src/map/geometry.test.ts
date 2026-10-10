import { describe, expect, it } from 'vitest';
import {
  angleRangesOverlap,
  isAngleWithin,
  isInsideArc,
  isInsidePolygon,
  normalizeAngle,
  pointToPolar,
  polarToPoint,
  slotBounds,
  slotContains,
  slotSpriteSize,
  squareCorners,
  toNormalized,
  toPixels,
} from './geometry';
import type { SlotDef } from './layout';

const arc = { innerRadius: 0.358, outerRadius: 0.44, startAngle: 4.74, endAngle: 21.78 };
const outer: SlotDef = { id: 'o', type: 'outer', shape: 'arc', x: 0.59, y: 0.11, angle: 13, arc };
const middle: SlotDef = {
  id: 'm',
  type: 'middle',
  shape: 'square',
  x: 0.5,
  y: 0.252,
  angle: 0,
  size: 0.054,
};
/** mid_1 of layout v4: an arc around North, starting below 0°. */
const middleArc: SlotDef = {
  id: 'mid_1',
  type: 'middle',
  shape: 'arc',
  x: 0.5,
  y: 0.253,
  angle: 0,
  arc: { innerRadius: 0.22, outerRadius: 0.274, startAngle: -16.5, endAngle: 16.5 },
};
const core: SlotDef = {
  id: 'c',
  type: 'core',
  shape: 'round',
  x: 0.5,
  y: 0.5,
  angle: 0,
  size: 0.184,
};

describe('polar conversions', () => {
  it.each([
    { polar: { radius: 0.25, angle: 0 }, point: { x: 0.5, y: 0.25 } },
    { polar: { radius: 0.25, angle: 90 }, point: { x: 0.75, y: 0.5 } },
    { polar: { radius: 0.25, angle: 180 }, point: { x: 0.5, y: 0.75 } },
    { polar: { radius: 0.25, angle: 270 }, point: { x: 0.25, y: 0.5 } },
  ])('places angle $polar.angle clockwise from North', ({ polar, point }) => {
    const result = polarToPoint(polar);
    expect(result.x).toBeCloseTo(point.x);
    expect(result.y).toBeCloseTo(point.y);
  });

  it.each([0, 13.26, 90, 229.74, 359.5])('round-trips angle %d through a point', (angle) => {
    const back = pointToPolar(polarToPoint({ radius: 0.4, angle }));
    expect(back.radius).toBeCloseTo(0.4);
    expect(back.angle).toBeCloseTo(angle);
  });

  it('matches the slot centers stored in layout.json', () => {
    const center = polarToPoint({ radius: (0.358 + 0.44) / 2, angle: 13.26 });
    expect(center.x).toBeCloseTo(0.5915, 3);
    expect(center.y).toBeCloseTo(0.1116, 3);
  });

  it('converts between normalized and pixel coordinates', () => {
    expect(toPixels({ x: 0.25, y: 0.5 }, 2048)).toEqual({ x: 512, y: 1024 });
    expect(toNormalized({ x: 512, y: 1024 }, 2048)).toEqual({ x: 0.25, y: 0.5 });
  });
});

describe('angles', () => {
  it.each([
    [-90, 270],
    [360, 0],
    [725, 5],
  ])('normalizes %d to %d', (input, expected) => {
    expect(normalizeAngle(input)).toBe(expected);
  });

  it.each([
    { angle: 10, start: 5, end: 20, within: true },
    { angle: 25, start: 5, end: 20, within: false },
    { angle: 355, start: 350, end: 10, within: true },
    { angle: 5, start: 350, end: 10, within: true },
    { angle: 180, start: 350, end: 10, within: false },
  ])('checks $angle within $start → $end', ({ angle, start, end, within }) => {
    expect(isAngleWithin(angle, start, end)).toBe(within);
  });

  it.each([
    { a: [220, 230], b: [229.74, 265.26], overlap: true },
    { a: [203.22, 220.26], b: [229.74, 265.26], overlap: false },
    { a: [350, 10], b: [5, 20], overlap: true },
    { a: [240, 250], b: [229.74, 265.26], overlap: true },
  ] as const)('detects overlap of $a and $b', ({ a, b, overlap }) => {
    expect(angleRangesOverlap(a, b)).toBe(overlap);
  });
});

describe('hit tests', () => {
  it.each([
    { label: 'middle of the arc', point: polarToPoint({ radius: 0.4, angle: 13 }), inside: true },
    { label: 'past the end angle', point: polarToPoint({ radius: 0.4, angle: 23 }), inside: false },
    {
      label: 'inside the inner radius',
      point: polarToPoint({ radius: 0.35, angle: 13 }),
      inside: false,
    },
    {
      label: 'outside the outer radius',
      point: polarToPoint({ radius: 0.45, angle: 13 }),
      inside: false,
    },
  ])('finds the $label inside the arc: $inside', ({ point, inside }) => {
    expect(isInsideArc(point, arc)).toBe(inside);
  });

  it('accepts points inside a rotated square and rejects its old corners', () => {
    const diamond = squareCorners({ x: 0.5, y: 0.5 }, 0.2, 45);
    expect(isInsidePolygon({ x: 0.5, y: 0.37 }, diamond)).toBe(true);
    expect(isInsidePolygon({ x: 0.41, y: 0.41 }, diamond)).toBe(false);
  });

  it.each([
    { slot: core, point: { x: 0.5, y: 0.42 }, inside: true },
    { slot: core, point: { x: 0.5, y: 0.4 }, inside: false },
    { slot: middle, point: { x: 0.52, y: 0.27 }, inside: true },
    { slot: middle, point: { x: 0.53, y: 0.252 }, inside: false },
    { slot: outer, point: polarToPoint({ radius: 0.36, angle: 5 }), inside: true },
    { slot: outer, point: polarToPoint({ radius: 0.36, angle: 4 }), inside: false },
    { slot: middleArc, point: polarToPoint({ radius: 0.25, angle: 0 }), inside: true },
    { slot: middleArc, point: polarToPoint({ radius: 0.25, angle: 350 }), inside: true },
    { slot: middleArc, point: polarToPoint({ radius: 0.25, angle: 16 }), inside: true },
    { slot: middleArc, point: polarToPoint({ radius: 0.25, angle: 17 }), inside: false },
    { slot: middleArc, point: polarToPoint({ radius: 0.25, angle: 343 }), inside: false },
    { slot: middleArc, point: polarToPoint({ radius: 0.215, angle: 0 }), inside: false },
    { slot: middleArc, point: polarToPoint({ radius: 0.28, angle: 0 }), inside: false },
  ])(
    'tells whether $point is inside the $slot.type $slot.shape slot',
    ({ slot, point, inside }) => {
      expect(slotContains(slot, point)).toBe(inside);
    },
  );
});

describe('slot footprint', () => {
  it('bounds an arc by its outline', () => {
    const bounds = slotBounds(outer);
    expect(bounds.top).toBeCloseTo(0.5 - 0.44 * Math.cos((4.74 * Math.PI) / 180), 3);
    expect(bounds.left).toBeGreaterThan(0.5);
  });

  it('keeps an arc sprite inside the arc depth', () => {
    expect(slotSpriteSize(outer)).toBeLessThan(arc.outerRadius - arc.innerRadius);
  });

  it('treats a middle arc like an outer one, across North', () => {
    const bounds = slotBounds(middleArc);
    expect(bounds.left + bounds.width / 2).toBeCloseTo(0.5);
    expect(bounds.top).toBeCloseTo(0.5 - 0.274);
    expect(slotSpriteSize(middleArc)).toBeLessThan(0.274 - 0.22);
  });

  it('sizes core and middle sprites from the slot size', () => {
    expect(slotSpriteSize(core)).toBeLessThan(core.size);
    expect(slotSpriteSize(middle)).toBeLessThan(middle.size);
  });
});
