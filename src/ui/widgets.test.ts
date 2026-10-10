import { describe, expect, it } from 'vitest';
import { parseCount } from './widgets';

// Every numeric field (give, take, deposit, transfer, materials) reads through parseCount.
describe('parseCount', () => {
  it.each([
    { text: '11', count: 11 },
    { text: ' 7 ', count: 7 },
    { text: '3.9', count: 3 },
    { text: '1e3', count: 1000 },
    { text: '', count: 0 },
    { text: 'abc', count: 0 },
    { text: '-5', count: 0 },
    { text: 'NaN', count: 0 },
    { text: 'Infinity', count: 0 },
  ])('reads "$text" as $count', ({ text, count }) => {
    expect(parseCount(text)).toBe(count);
  });

  it('adds typed values as numbers, never concatenating them', () => {
    expect(parseCount('1') + parseCount('1')).toBe(2);
  });
});
