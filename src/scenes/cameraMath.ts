/** Screen pixels of the canvas hidden behind HTML on top of it (the slot panel, the drawer). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Keeps the centre of the useful area (the view minus what covers it) over the
 * map, so any edge of the map can reach that centre and the map never leaves
 * the screen, at any zoom. `usefulOffset` is how far, in world units, the
 * useful centre sits from the camera centre on this axis.
 */
export function clampAxis(center: number, worldSize: number, usefulOffset: number): number {
  return Math.min(Math.max(center, 0 - usefulOffset), worldSize - usefulOffset);
}

/** World units between the camera centre and the useful centre, given the insets on each side. */
export function usefulOffset(insetStart: number, insetEnd: number, zoom: number): number {
  return (insetStart - insetEnd) / 2 / zoom;
}

/**
 * Turns covering panels into insets: a panel that spans more of the height
 * than of the width covers a side; otherwise (the bottom sheet on phones) it
 * covers the bottom or the top.
 */
export function coveredInsets(canvas: ScreenRect, covers: readonly ScreenRect[]): Insets {
  const width = canvas.right - canvas.left;
  const height = canvas.bottom - canvas.top;
  return covers.reduce<Insets>((insets, cover) => {
    const clip = {
      left: Math.max(cover.left, canvas.left),
      right: Math.min(cover.right, canvas.right),
      top: Math.max(cover.top, canvas.top),
      bottom: Math.min(cover.bottom, canvas.bottom),
    };
    if (clip.right <= clip.left || clip.bottom <= clip.top) return insets;
    const isSide = (clip.bottom - clip.top) / height > (clip.right - clip.left) / width;
    if (isSide) {
      const isRight = clip.left + clip.right > canvas.left + canvas.right;
      return isRight
        ? { ...insets, right: Math.max(insets.right, Math.min(width, canvas.right - clip.left)) }
        : { ...insets, left: Math.max(insets.left, Math.min(width, clip.right - canvas.left)) };
    }
    const isBottom = clip.top + clip.bottom > canvas.top + canvas.bottom;
    return isBottom
      ? { ...insets, bottom: Math.max(insets.bottom, Math.min(height, canvas.bottom - clip.top)) }
      : { ...insets, top: Math.max(insets.top, Math.min(height, clip.bottom - canvas.top)) };
  }, NO_INSETS);
}

/**
 * How far to move the camera on one axis so `point` sits inside the useful
 * range [min, max] with a margin; 0 when it already does. A range too small for
 * the margin brings the point to its middle.
 */
export function revealShift(point: number, min: number, max: number, margin: number): number {
  if (max - min <= margin * 2) return point - (min + max) / 2;
  if (point < min + margin) return point - (min + margin);
  if (point > max - margin) return point - (max - margin);
  return 0;
}
