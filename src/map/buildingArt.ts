import { normalizeAngle, polarToPoint, type Point } from './geometry';
import type { BuildingFx } from '../model/schema';
import type { ArcShape, SlotDef, SlotType } from './layout';

/** Final building art lives next to the placeholders, named `<id>.<shape>[.lv<N>].png`. */
export const BUILDING_ART_DIR = 'assets/buildings';

/**
 * Where a building's art goes on the map, in normalized units. The art is a
 * `width` × `height` box centered on `center`, turned clockwise by `rotation` degrees.
 * Art is always drawn as if the slot sat at North: outer art has the wall on top,
 * middle art faces down (towards the center of the Axis).
 */
export interface ArtPlacement {
  readonly center: Point;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function artFileName(buildingId: string, shape: SlotType, level: number): string {
  const suffix = level > 1 ? `.lv${level}` : '';
  return `${buildingId}.${shape}${suffix}.png`;
}

/**
 * The art for `level`, or the closest lower level that exists, or the base file.
 * Undefined when the building has no art for this shape yet (the placeholder is used).
 */
export function pickArtFile(
  available: ReadonlySet<string>,
  buildingId: string,
  shape: SlotType,
  level: number,
): string | undefined {
  const candidates = Array.from({ length: Math.max(1, level) }, (_, i) =>
    artFileName(buildingId, shape, level - i),
  );
  return candidates.find((file) => available.has(file));
}

const ART_KEY_PREFIX = 'art.';

interface ImageManifest {
  readonly images: Readonly<Record<string, string>>;
}

export function artTextureKey(file: string): string {
  return `${ART_KEY_PREFIX}${file}`;
}

/** Adds one manifest entry per art file, so the preloader loads them like any other image. */
export function withBuildingArt(manifest: ImageManifest, files: readonly string[]): ImageManifest {
  const art = Object.fromEntries(
    files.map((file) => [artTextureKey(file), `${BUILDING_ART_DIR}/${file}`]),
  );
  return { ...manifest, images: { ...manifest.images, ...art } };
}

/** Art files registered in the manifest by `withBuildingArt`. */
export function availableArtFiles(images: Readonly<Record<string, string>>): ReadonlySet<string> {
  return new Set(
    Object.keys(images)
      .filter((key) => key.startsWith(ART_KEY_PREFIX))
      .map((key) => key.slice(ART_KEY_PREFIX.length)),
  );
}

export function artPlacement(slot: SlotDef): ArtPlacement {
  switch (slot.type) {
    case 'core':
      return { center: slot, width: slot.size, height: slot.size, rotation: 0 };
    case 'middle':
      return middlePlacement(slot.size, slot);
    case 'outer':
      return outerPlacement(slot.arc);
  }
}

/** A point given in art coordinates (0–1, origin top-left of the image) on the map. */
export function artPointToMap(
  { center, width, height, rotation }: ArtPlacement,
  art: Point,
): Point {
  const dx = (art.x - 0.5) * width;
  const dy = (art.y - 0.5) * height;
  const a = toRadians(rotation);
  return {
    x: center.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: center.y + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

/**
 * The squares stay axis-aligned on the map, so art turned to face the center
 * shrinks just enough to stay inside them (to 71% on the diagonals).
 */
function middlePlacement(size: number, slot: SlotDef): ArtPlacement {
  const a = toRadians(slot.angle);
  const side = size / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a)));
  return { center: slot, width: side, height: side, rotation: slot.angle };
}

/**
 * The box that wraps the annular sector when it sits at North: as wide as the
 * outer edge's chord, from the top of the outer edge down to the inner corners.
 */
function outerPlacement(arc: ArcShape): ArtPlacement {
  const span = normalizeAngle(arc.endAngle - arc.startAngle);
  const half = toRadians(span / 2);
  const width = 2 * arc.outerRadius * Math.sin(half);
  const height = arc.outerRadius - arc.innerRadius * Math.cos(half);
  const angle = normalizeAngle(arc.startAngle + span / 2);
  return {
    center: polarToPoint({ radius: arc.outerRadius - height / 2, angle }),
    width,
    height,
    rotation: angle,
  };
}

export interface PlacedFx {
  readonly fx: BuildingFx;
  /** Normalized map position. */
  readonly point: Point;
}

/** The effects active at `level`, moved from art coordinates onto the map. */
export function placeFx(
  placement: ArtPlacement,
  effects: readonly BuildingFx[],
  level: number,
): PlacedFx[] {
  return effects
    .filter((fx) => level >= (fx.minLevel ?? 1))
    .map((fx) => ({ fx, point: artPointToMap(placement, fx) }));
}
