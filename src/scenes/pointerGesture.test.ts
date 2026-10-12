import { describe, expect, it } from 'vitest';
import { isCanvasGesture, isOverCanvas, startedOnCanvas } from './pointerGesture';

const canvas = { id: 'canvas' };
const panel = { id: 'panel' };

describe('pointer gestures', () => {
  it.each([
    { down: canvas, up: canvas, isClick: true, isPan: true },
    { down: panel, up: panel, isClick: false, isPan: false },
    { down: canvas, up: panel, isClick: false, isPan: true },
    { down: panel, up: canvas, isClick: false, isPan: false },
  ])('treats down on $down.id and up on $up.id', ({ down, up, isClick, isPan }) => {
    const pointer = { downElement: down, upElement: up };
    expect(isCanvasGesture(pointer, canvas)).toBe(isClick);
    expect(startedOnCanvas(pointer, canvas)).toBe(isPan);
  });

  it('tells whether the current event came from the canvas', () => {
    const base = { downElement: null, upElement: null };
    expect(isOverCanvas({ ...base, event: { target: canvas } }, canvas)).toBe(true);
    expect(isOverCanvas({ ...base, event: { target: panel } }, canvas)).toBe(false);
    expect(isOverCanvas({ ...base, event: null }, canvas)).toBe(false);
  });
});
