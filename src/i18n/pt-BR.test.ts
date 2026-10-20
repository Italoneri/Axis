import { describe, expect, it } from 'vitest';
import {
  archiveAction,
  depotAction,
  jobEffectText,
  logEntryText,
  t,
  type TextContext,
} from './pt-BR';
import type { LogEntry } from '../model/schema';

const ctx: TextContext = {
  building: (id) => id,
  buildingAt: (id, slotId) => (slotId ? `${id}@${slotId}` : id),
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
    { effect: 'brewing', amount: 1, text: 'Gus adiantou os preparos de arcane_lab em 1 dia' },
    { effect: 'brewing', amount: -2, text: 'Gus atrasou os preparos de arcane_lab em 2 dias' },
  ] as const)('reads $effect $amount as "$text"', ({ effect, amount, text }) => {
    const target = {
      produce: 'Ferro',
      research: 'Runas',
      construction: 'forge',
      brewing: 'arcane_lab',
    }[effect];
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
      effect: { type: 'brewing', perDay: 1 },
      tenths: -5,
      text: 'preparos atrasados em 0,5 dia por dia',
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

describe('archive log', () => {
  it.each([
    {
      change: { target: 'topic', action: 'created', title: 'Pets' },
      text: 'Thorin criou o tópico Pets',
    },
    {
      change: { target: 'note', action: 'edited', title: 'Requisição de Selos' },
      text: "Thorin editou 'Requisição de Selos'",
    },
    {
      change: {
        target: 'note',
        action: 'moved',
        title: 'Zolt-Raak',
        from: 'NPCs',
        to: 'Jogadores',
      },
      text: "Thorin moveu 'Zolt-Raak' de NPCs para Jogadores",
    },
    {
      change: { target: 'note', action: 'removed', title: 'Mapa do Portão Oito' },
      text: "Thorin removeu 'Mapa do Portão Oito' (está na lixeira)",
    },
    {
      change: { target: 'note', action: 'restored', title: 'Mapa' },
      text: "Thorin restaurou 'Mapa'",
    },
    {
      change: { target: 'notes', action: 'pasted', title: 'NPCs', count: 12 },
      text: 'Thorin colou 12 registros em NPCs',
    },
    {
      change: { target: 'trash', action: 'emptied' },
      text: 'Thorin esvaziou a lixeira do Arquivo',
    },
    {
      change: { target: 'images', action: 'attached', title: 'Mapa do Portão Oito', count: 2 },
      text: "Thorin anexou 2 imagens a 'Mapa do Portão Oito'",
    },
    {
      change: { target: 'images', action: 'attached', title: 'Carta', count: 1 },
      text: "Thorin anexou uma imagem a 'Carta'",
    },
    {
      change: { target: 'image', action: 'removed', title: 'Carta' },
      text: "Thorin removeu uma imagem de 'Carta'",
    },
  ] as const)('reads $text', ({ change, text }) => {
    expect(archiveAction('Thorin', change)).toBe(text);
  });

  it('names the actor in the entry', () => {
    const change = { target: 'topic', action: 'removed', title: 'Pets' } as const;
    expect(logEntryText({ day: 2, kind: 'archive_changed', actor: 'Bia', change }, ctx)).toBe(
      'Dia 2 — Bia removeu o tópico Pets (está na lixeira)',
    );
  });
});

describe('depot log', () => {
  it.each([
    {
      change: { target: 'section', action: 'created', title: 'Poções' },
      text: 'Thorin criou a seção Poções no depósito',
    },
    {
      change: { target: 'section', action: 'removed', title: 'Poções' },
      text: 'Thorin removeu a seção Poções do depósito (está na lixeira)',
    },
    {
      change: { target: 'item', action: 'created', title: 'Poção de cura', quantity: 3 },
      text: "Thorin pôs 'Poção de cura' (×3) no depósito",
    },
    {
      change: { target: 'item', action: 'removed', title: 'Corda', quantity: 1 },
      text: "Thorin removeu 'Corda' (×1) do depósito (está na lixeira)",
    },
    {
      change: {
        target: 'item',
        action: 'moved',
        title: 'Corda',
        quantity: 1,
        from: 'Outros',
        to: 'Ferramentas',
      },
      text: "Thorin moveu 'Corda' (×1) de Outros para Ferramentas no depósito",
    },
    {
      change: { target: 'item', action: 'stored', title: 'Escudo', quantity: 1, to: 'Armas' },
      text: "Thorin guardou 'Escudo' (×1) no depósito, em Armas",
    },
    {
      change: {
        target: 'item',
        action: 'taken',
        title: 'Poção de cura',
        quantity: 2,
        from: 'Poções',
      },
      text: "Thorin retirou 'Poção de cura' (×2) de Poções do depósito",
    },
    {
      change: { target: 'trash', action: 'emptied' },
      text: 'Thorin esvaziou a lixeira do depósito',
    },
  ] as const)('reads $text', ({ change, text }) => {
    expect(depotAction('Thorin', change)).toBe(text);
  });
});

describe('shop purchase log', () => {
  const goldCtx: TextContext = { ...ctx, gold: (bronze) => `${bronze} PB` };
  it.each([
    {
      entry: { quantity: 12, bronze: 36, item: 'Madeira' },
      text: 'Thorin comprou 12 Madeira no Entreposto por 36 PB do Acampamento',
    },
    {
      entry: { quantity: 2, bronze: 6, item: 'Ferro', wallet: 'Thorin' },
      text: 'Thorin comprou 2 Ferro no Entreposto por 6 PB de Thorin',
    },
    {
      entry: { quantity: 1, bronze: 80 },
      text: 'Thorin comprou um item no Entreposto por 80 PB do Acampamento',
    },
    {
      entry: { quantity: 3, bronze: 80 },
      text: 'Thorin comprou 3 itens no Entreposto por 80 PB do Acampamento',
    },
    {
      entry: { quantity: 1, bronze: 0, item: 'Espada' },
      text: 'Thorin comprou 1 Espada no Entreposto de graça',
    },
  ])('writes "$text"', ({ entry, text }) => {
    const full = { day: 5, kind: 'shop_purchased', actor: 'Thorin', ...entry } as const;
    expect(logEntryText(full, goldCtx)).toBe(`Dia 5 — ${text}`);
  });
});

describe('shop sale log', () => {
  const goldCtx: TextContext = { ...ctx, gold: (bronze) => `${bronze} PB` };
  it('writesWhoSoldWhatForHowMuch', () => {
    const entry = {
      day: 5,
      kind: 'shop_sold',
      actor: 'Thorin',
      material: 'Madeira',
      quantity: 10,
      bronze: 15,
    } as const;
    expect(logEntryText(entry, goldCtx)).toBe(
      'Dia 5 — Thorin vendeu 10 Madeira ao Entreposto por 15 PB',
    );
  });
});

describe('lab log', () => {
  const ingredients = [
    { material: 'Hortelã', quantity: 3 },
    { material: 'Camomila', quantity: 1 },
  ];
  const cases: { entry: LogEntry; text: string }[] = [
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_brewed',
        station: 'alambique-2',
        material: 'Poção de Cura',
        ingredients,
      },
      text: 'Thorin começou Poção de Cura em Alambique 2 (3 Hortelã e 1 Camomila)',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_brewed',
        station: 'circulo-1',
        material: 'Essência',
        ingredients: [],
      },
      text: 'Thorin começou Essência em Círculo de transmutação 1',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_collected',
        material: 'Poção de Cura',
        quantity: 2,
      },
      text: 'Thorin recolheu 2 Poção de Cura no Laboratório Arcano',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_discarded',
        station: 'caldeirao-1',
        material: 'Elixir de Mana',
      },
      text: 'Thorin descartou Elixir de Mana de Caldeirão 1',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_ingredients_returned',
        station: 'caldeirao-2',
        ingredients,
      },
      text: 'O Laboratório Arcano devolveu 3 Hortelã e 1 Camomila ao estoque (Caldeirão 2)',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'garden_harvested',
        material: 'Hortelã',
        quantity: 3,
        lost: true,
      },
      text: 'Thorin colheu 3 Hortelã na Estufa de Ervas, mas o item foi removido do Depósito: perdido',
    },
    {
      entry: {
        day: 5,
        actor: 'Thorin',
        kind: 'lab_collected',
        material: 'Porção de cavalo',
        quantity: 2,
        lost: true,
      },
      text: 'Thorin recolheu 2 Porção de cavalo no Laboratório Arcano, mas o item foi removido do Depósito: perdido',
    },
    {
      entry: { day: 5, kind: 'garden_seed_returned', seed: 'Semente', quantity: 1, lost: true },
      text: 'A Estufa de Ervas devolveu 1 Semente ao estoque, mas o item foi removido do Depósito: perdido',
    },
    {
      entry: {
        day: 5,
        kind: 'lab_ingredients_returned',
        station: 'caldeirao-2',
        ingredients: [
          { material: 'Hortelã', quantity: 3, lost: true },
          { material: 'Camomila', quantity: 1 },
        ],
      },
      text: 'O Laboratório Arcano devolveu 3 Hortelã (perdido: item removido do Depósito) e 1 Camomila ao estoque (Caldeirão 2)',
    },
  ];
  it.each(cases)('writes $entry.kind', ({ entry, text }) => {
    expect(logEntryText(entry, ctx)).toBe(`Dia 5 — ${text}`);
  });
});
