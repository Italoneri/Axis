import { describe, expect, it } from 'vitest';
import {
  artPlacement,
  artPointToMap,
  availableArtFiles,
  pickArtFile,
  placeFx,
  withBuildingArt,
} from './buildingArt';
import { normalizeAngle, pointToPolar, polarToPoint } from './geometry';
import type { BuildingFx } from '../model/schema';
import type { SlotDef } from './layout';

function outerSlot(startAngle: number, endAngle: number): SlotDef {
  const angle = (startAngle + endAngle) / 2;
  return {
    id: `outer_${angle}`,
    type: 'outer',
    shape: 'arc',
    ...polarToPoint({ radius: 0.4, angle }),
    angle,
    arc: { innerRadius: 0.358, outerRadius: 0.44, startAngle, endAngle },
  };
}

/** A middle arc from layout v4: r 0.22–0.274, 33° wide. */
function middleArcSlot(angle: number): SlotDef {
  return {
    id: `mid_${angle}`,
    type: 'middle',
    shape: 'arc',
    ...polarToPoint({ radius: 0.247, angle }),
    angle,
    arc: {
      innerRadius: 0.22,
      outerRadius: 0.274,
      startAngle: angle - 16.5,
      endAngle: angle + 16.5,
    },
  };
}

/** Compares angles across the 0°/360° seam. */
function expectAngle(actual: number, expected: number): void {
  expect(normalizeAngle(actual - expected + 180) - 180).toBeCloseTo(0);
}

function middleSlot(angle: number): SlotDef {
  return {
    id: `mid_${angle}`,
    type: 'middle',
    shape: 'square',
    ...polarToPoint({ radius: 0.248, angle }),
    angle,
    size: 0.054,
  };
}

describe('pickArtFile', () => {
  const available = new Set(['forge.outer.png', 'forge.outer.lv3.png', 'library.middle.png']);

  it.each([
    { id: 'forge', shape: 'outer', level: 1, file: 'forge.outer.png' },
    { id: 'forge', shape: 'outer', level: 2, file: 'forge.outer.png' },
    { id: 'forge', shape: 'outer', level: 3, file: 'forge.outer.lv3.png' },
    { id: 'forge', shape: 'outer', level: 5, file: 'forge.outer.lv3.png' },
    { id: 'forge', shape: 'middle', level: 1, file: undefined },
    { id: 'library', shape: 'middle', level: 2, file: 'library.middle.png' },
    { id: 'armory', shape: 'outer', level: 1, file: undefined },
  ] as const)('picks $file for $id $shape level $level', ({ id, shape, level, file }) => {
    expect(pickArtFile(available, id, shape, level)).toBe(file);
  });
});

describe('outer art placement', () => {
  it('matches the 768×506 arc template proportions', () => {
    const { width, height } = artPlacement(outerSlot(4.74, 21.78));
    expect(width / height).toBeCloseTo(768 / 506, 2);
  });

  it.each([
    { start: 4.74, end: 21.78 },
    { start: 158.22, end: 175.26 },
    { start: 293.22, end: 310.26 },
  ])('keeps the wall on the wall for the arc $start°–$end°', ({ start, end }) => {
    const placement = artPlacement(outerSlot(start, end));
    const polarOf = (x: number, y: number) => pointToPolar(artPointToMap(placement, { x, y }));

    const wallMiddle = polarOf(0.5, 0);
    expect(wallMiddle.radius).toBeCloseTo(0.44);
    expectAngle(wallMiddle.angle, (start + end) / 2);

    // The inner edge is shorter than the outer chord, so its corners sit inset on the bottom row.
    const half = (((end - start) / 2) * Math.PI) / 180;
    const inset = 0.5 - (0.358 * Math.sin(half)) / placement.width;

    const frontLeft = polarOf(inset, 1);
    expect(frontLeft.radius).toBeCloseTo(0.358);
    expectAngle(frontLeft.angle, start);

    const frontRight = polarOf(1 - inset, 1);
    expect(frontRight.radius).toBeCloseTo(0.358);
    expectAngle(frontRight.angle, end);
  });
});

describe('middle arc art placement', () => {
  it('matches the 768×311 middle arc template proportions', () => {
    const { width, height } = artPlacement(middleArcSlot(0));
    expect(width / height).toBeCloseTo(768 / 311, 1);
  });

  it.each([0, 45, 180, 315])('puts the outer edge on top and the front inwards at %i°', (angle) => {
    const placement = artPlacement(middleArcSlot(angle));
    const polarOf = (x: number, y: number) => pointToPolar(artPointToMap(placement, { x, y }));

    const outerEdge = polarOf(0.5, 0);
    expect(outerEdge.radius).toBeCloseTo(0.274);
    expectAngle(outerEdge.angle, angle);

    const half = (16.5 * Math.PI) / 180;
    const inset = 0.5 - (0.22 * Math.sin(half)) / placement.width;
    const frontLeft = polarOf(inset, 1);
    expect(frontLeft.radius).toBeCloseTo(0.22);
    expectAngle(frontLeft.angle, angle - 16.5);
    expect(placement.rotation).toBeCloseTo(normalizeAngle(angle));
  });
});

describe('middle art placement', () => {
  it.each([0, 45, 90, 180, 315])(
    'turns the front of the art towards the center at %i°',
    (angle) => {
      const slot = middleSlot(angle);
      const placement = artPlacement(slot);
      const front = pointToPolar(artPointToMap(placement, { x: 0.5, y: 1 }));
      expect(front.radius).toBeCloseTo(0.248 - placement.height / 2);
      expectAngle(front.angle, angle);
    },
  );

  it.each([
    { angle: 0, side: 0.054 },
    { angle: 45, side: 0.054 / Math.SQRT2 },
  ])('shrinks the art to stay inside the square at $angle°', ({ angle, side }) => {
    expect(artPlacement(middleSlot(angle)).width).toBeCloseTo(side);
  });
});

describe('core art placement', () => {
  it('fills the circle without turning', () => {
    const core: SlotDef = {
      id: 'c',
      type: 'core',
      shape: 'round',
      x: 0.5,
      y: 0.5,
      angle: 0,
      size: 0.184,
    };
    const corner = artPointToMap(artPlacement(core), { x: 0, y: 0 });
    expect(corner.x).toBeCloseTo(0.5 - 0.092);
    expect(corner.y).toBeCloseTo(0.5 - 0.092);
  });
});

describe('building art manifest', () => {
  it('registers each art file and reads the same files back', () => {
    const manifest = withBuildingArt({ images: { 'icon.forge': 'assets/icons/forge.png' } }, [
      'forge.outer.png',
      'forge.outer.lv2.png',
    ]);
    expect(manifest.images['art.forge.outer.png']).toBe('assets/buildings/forge.outer.png');
    expect([...availableArtFiles(manifest.images)]).toEqual([
      'forge.outer.png',
      'forge.outer.lv2.png',
    ]);
  });
});

describe('placeFx', () => {
  const effects: BuildingFx[] = [
    { type: 'smoke', x: 0.5, y: 0 },
    { type: 'glow', x: 0.5, y: 0.5, color: '#ff7a1a', radius: 0.08 },
    { type: 'sparks', x: 0.5, y: 1, minLevel: 2 },
    { type: 'glow', x: 0.2, y: 0.2, color: '#ffb347', radius: 0.05, minLevel: 2, maxLevel: 2 },
  ];

  it.each([
    { level: 1, types: ['smoke', 'glow'] },
    { level: 2, types: ['smoke', 'glow', 'sparks', 'glow'] },
    { level: 3, types: ['smoke', 'glow', 'sparks'] },
  ])('keeps the effects allowed at level $level', ({ level, types }) => {
    const placed = placeFx(artPlacement(outerSlot(4.74, 21.78)), effects, level);
    expect(placed.map(({ fx }) => fx.type)).toEqual(types);
  });

  it.each([
    { start: 4.74, end: 21.78, wall: { x: 0.6009, y: 0.0717 } },
    { start: 94.74, end: 111.78, wall: { x: 0.9283, y: 0.6009 } },
    { start: 184.74, end: 201.78, wall: { x: 0.3991, y: 0.9283 } },
  ])('turns art points with the arc $start°–$end°', ({ start, end, wall }) => {
    const [smoke] = placeFx(artPlacement(outerSlot(start, end)), effects, 1);
    expect(smoke?.point.x).toBeCloseTo(wall.x, 3);
    expect(smoke?.point.y).toBeCloseTo(wall.y, 3);
  });
});
