/** What a gesture needs from Phaser's pointer: where the press and the release landed. */
export interface PointerTargets {
  downElement: unknown;
  upElement: unknown;
  event?: { target: unknown } | null;
}

/**
 * Phaser also listens for mousedown/mouseup on the window, so a click on the
 * HTML panel over the canvas still hit-tests the map underneath. Only a gesture
 * that both started and ended on the canvas is a click on the map.
 */
export function isCanvasGesture(pointer: PointerTargets, canvas: unknown): boolean {
  return pointer.downElement === canvas && pointer.upElement === canvas;
}

/** A press that started on the panel (or a dialog) must not pan the map. */
export function startedOnCanvas(pointer: PointerTargets, canvas: unknown): boolean {
  return pointer.downElement === canvas;
}

/** True while the event behind the pointer came from the canvas itself, not from HTML on top. */
export function isOverCanvas(pointer: PointerTargets, canvas: unknown): boolean {
  return pointer.event?.target === canvas;
}
