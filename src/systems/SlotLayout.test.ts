import { describe, expect, it } from 'vitest';
import { moveSlot, serializeSlots } from './SlotLayout';
import { testCatalog } from './testFixtures';

const file = testCatalog.slots;

describe('moveSlot', () => {
  it.each([
    { x: 0.123456, y: 0.987654, expected: { x: 0.1235, y: 0.9877 } },
    { x: -0.2, y: 1.4, expected: { x: 0, y: 1 } },
  ])('moves to ($x, $y) as $expected', ({ x, y, expected }) => {
    const moved = moveSlot(file, 'outer_n', x, y);
    expect(moved.slots.find((s) => s.id === 'outer_n')).toMatchObject(expected);
  });

  it('leaves other slots and the original untouched', () => {
    const moved = moveSlot(file, 'outer_n', 0.1, 0.1);
    expect(moved.slots.find((s) => s.id === 'core')).toEqual(
      file.slots.find((s) => s.id === 'core'),
    );
    expect(file.slots.find((s) => s.id === 'outer_n')).toMatchObject({ x: 0.5, y: 0.2 });
  });
});

describe('serializeSlots', () => {
  it('produces JSON that round-trips', () => {
    expect(JSON.parse(serializeSlots(file))).toEqual(file);
  });
});
