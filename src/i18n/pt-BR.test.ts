import { describe, expect, it } from 'vitest';
import { jobEffectText, logEntryText, t, type TextContext } from './pt-BR';

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

describe('days advanced log', () => {
  it.each([
    { days: 1, text: 'Dia 5 — 1 dia se passou' },
    { days: 3, text: 'Dia 5 — 3 dias se passaram' },
  ])('agrees with $days day(s)', ({ days, text }) => {
    expect(logEntryText({ day: 5, kind: 'days_advanced', days }, ctx)).toBe(text);
  });
});

describe('npc work log', () => {
  it.each([
    { effect: 'produce', amount: 3, text: 'Gus produziu 3 Ferro' },
    { effect: 'produce', amount: -2, text: 'Gus estragou 2 Ferro' },
    { effect: 'research', amount: 4, text: "Gus avançou a pesquisa 'Runas' em 4%" },
    { effect: 'research', amount: -2, text: "Gus fez a pesquisa 'Runas' regredir 2%" },
    { effect: 'construction', amount: 1, text: 'Gus adiantou a obra de forge em 1 dia' },
    { effect: 'construction', amount: -2, text: 'Gus atrasou a obra de forge em 2 dias' },
  ] as const)('reads $effect $amount as "$text"', ({ effect, amount, text }) => {
    const target = { produce: 'Ferro', research: 'Runas', construction: 'forge' }[effect];
    const entry = { day: 5, kind: 'npc_worked', npc: 'Gus', effect, amount, target } as const;
    expect(logEntryText(entry, ctx)).toBe(`Dia 5 — ${text}`);
  });
});

describe('jobEffectText', () => {
  it.each([
    {
      effect: { type: 'produce', material: 'Ferro', perDay: 1 },
      tenths: 34,
      text: '+3,4 Ferro por dia',
    },
    {
      effect: { type: 'produce', material: 'Ferro', perDay: 1 },
      tenths: -20,
      text: '-2,0 Ferro por dia',
    },
    { effect: { type: 'research', perDay: 1 }, tenths: -4, text: '-0,4 de progresso por dia' },
    {
      effect: { type: 'construction', perDay: 1 },
      tenths: 15,
      text: 'obra adiantada em 1,5 dia por dia',
    },
    {
      effect: { type: 'construction', perDay: 1 },
      tenths: -10,
      text: 'obra atrasada em 1,0 dia por dia',
    },
  ] as const)('shows $tenths tenths as "$text"', ({ effect, tenths, text }) => {
    expect(jobEffectText(effect, tenths, ctx)).toBe(text);
  });
});
