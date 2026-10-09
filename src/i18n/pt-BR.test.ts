import { describe, expect, it } from 'vitest';
import { logEntryText, t, type TextContext } from './pt-BR';

const ctx: TextContext = {
  building: (id) => id,
  material: (id) => id,
  coins: () => '',
  gold: () => '',
};

describe('t.percent', () => {
  it.each([
    { value: 42, text: '42%' },
    { value: 37.14, text: '37,1%' },
    { value: 18.6, text: '18,6%' },
    { value: 20.04, text: '20%' },
    { value: 0, text: '0%' },
  ])('shows $value as $text', ({ value, text }) => {
    expect(t.percent(value)).toBe(text);
  });
});

describe('influence log', () => {
  it('names the world, its change and the new total', () => {
    const text = logEntryText(
      {
        day: 20,
        kind: 'influence_changed',
        world: 'Terras Dracônicas',
        from: 35,
        to: 42,
        total: 18.6,
      },
      ctx,
    );
    expect(text).toBe('Dia 20 — Influência em Terras Dracônicas: 35% → 42% (total: 18,6%)');
  });
});
