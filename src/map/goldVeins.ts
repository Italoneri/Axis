/** RGBA pixels, the shape of ImageData without depending on the DOM. */
export interface Pixels {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** One value per pixel in [0, 1], row-major, for a square of side `size`. */
export interface Mask {
  readonly values: Float32Array;
  readonly size: number;
}

const MIN_SATURATION = 0.25;
const MIN_BRIGHTNESS = 0.3;
/** Gold must lean red, not blue: R > B by this margin (0–1). */
const RED_OVER_BLUE = 0.08;
/** 3-tap approximation of a Gaussian blur with sigma ≈ 0.6 px, softening jagged vein edges. */
const BLUR_KERNEL = [0.166, 0.668, 0.166] as const;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Picks the gold of the marble: yellowish, saturated and bright pixels.
 * Soft thresholds keep a gradient at the vein borders instead of a hard cut.
 */
export function goldStrength(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = (max - min) / (max + 1e-6);
  if (r <= b + RED_OVER_BLUE) return 0;
  return (
    clamp01((saturation - MIN_SATURATION) / MIN_SATURATION) *
    clamp01((max - MIN_BRIGHTNESS) / MIN_BRIGHTNESS)
  );
}

/** Gold mask of a square marble image, blurred slightly. */
export function extractGoldMask(marble: Pixels): Mask {
  const size = Math.min(marble.width, marble.height);
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * marble.width + x) * 4;
      values[y * size + x] = goldStrength(
        (marble.data[i] ?? 0) / 255,
        (marble.data[i + 1] ?? 0) / 255,
        (marble.data[i + 2] ?? 0) / 255,
      );
    }
  }
  return blur({ values, size });
}

/**
 * More veins from the same image: the mask turned 120° and mirrored, plus the
 * mask turned 240°, merged by taking the brighter of the two.
 */
export function rotatedCopies(mask: Mask): Mask {
  const { size } = mask;
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mirrored = sampleRotated(mask, size - 1 - x, y, 120);
      values[y * size + x] = Math.max(mirrored, sampleRotated(mask, x, y, 240));
    }
  }
  return { values, size };
}

/** Original veins plus the copies scaled by `copies` (0 turns them off). */
export function combineVeins(base: Mask, extra: Mask, copies: number): Float32Array {
  return base.values.map((value, i) => Math.max(value, (extra.values[i] ?? 0) * copies));
}

/** Deterministic noise in [0, 1) so the glitter looks the same on every load. */
export function glitterNoise(count: number, seed = 1): Float32Array {
  let state = seed >>> 0;
  return Float32Array.from({ length: count }, () => {
    // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

/** Value of the mask turned counter-clockwise by `degrees` around its center (nearest pixel). */
function sampleRotated(mask: Mask, x: number, y: number, degrees: number): number {
  const center = (mask.size - 1) / 2;
  const a = (degrees * Math.PI) / 180;
  const dx = x - center;
  const dy = y - center;
  const sx = Math.round(center + dx * Math.cos(a) - dy * Math.sin(a));
  const sy = Math.round(center + dx * Math.sin(a) + dy * Math.cos(a));
  if (sx < 0 || sy < 0 || sx >= mask.size || sy >= mask.size) return 0;
  return mask.values[sy * mask.size + sx] ?? 0;
}

function blur(mask: Mask): Mask {
  return blurPass(blurPass(mask, 1, 0), 0, 1);
}

function blurPass({ values, size }: Mask, stepX: number, stepY: number): Mask {
  const out = new Float32Array(values.length);
  const [side, middle] = BLUR_KERNEL;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const before = x - stepX >= 0 && y - stepY >= 0 ? (values[i - stepX - stepY * size] ?? 0) : 0;
      const after =
        x + stepX < size && y + stepY < size ? (values[i + stepX + stepY * size] ?? 0) : 0;
      out[i] = (values[i] ?? 0) * middle + (before + after) * side;
    }
  }
  return { values: out, size };
}
