import { describe, expect, it } from 'vitest';
import type { Depot, DepotItem } from '../../systems/Depot';
import { makeState } from '../../systems/testFixtures';
import { stockGroups } from './StockPicker';

const NOW = '2026-10-19T12:00:00.000Z';

function item(id: string, sectionId: string, extra: Partial<DepotItem> = {}): DepotItem {
  return {
    id,
    sectionId,
    name: id,
    kind: 'outro',
    quantity: 0,
    notes: '',
    order: 0,
    authorId: 'mestre',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...extra,
  };
}

const section = (id: string, name: string, ownerId: string | null, order: number) => ({
  id,
  name,
  ownerId,
  order,
  authorId: 'mestre',
  deletedAt: null,
});

const depot: Depot = {
  sections: [
    section('porcoes', 'porções', null, 0),
    section('vazia', 'Vazia', null, 1),
    section('ervas', 'Ervas', null, 2),
    section('bau', 'Baú', 'thorin', 0),
  ],
  items: [
    item('cavalo', 'porcoes', { name: 'porção de cavalo', quantity: 2, order: 0 }),
    item('lixo', 'porcoes', { name: 'Velha', deletedAt: NOW }),
    item('ferro', 'ervas', { name: 'Ferro', quantity: 1 }),
    item('segredo', 'bau', { name: 'Segredo' }),
  ],
};

const state = makeState();
const labels = (groups: ReturnType<typeof stockGroups>) =>
  groups.map((g) => [g.label, g.choices.map((c) => `${c.key}=${c.label}`)]);

describe('stockGroups', () => {
  it('listsEachGroupSectionWithItsItemsBeforeTheMaterials', () => {
    expect(labels(stockGroups(state, depot))).toEqual([
      ['Depósito › porções', ['d:cavalo=porção de cavalo ×2']],
      ['Depósito › Ervas', ['d:ferro=Ferro (Depósito) ×1']],
      ['Minérios', ['m:iron=Ferro', 'm:wood=Madeira', 'm:aetherium=Aetherium']],
    ]);
  });

  it('showsNoDepotGroupWhenTheDepotIsEmpty', () => {
    const groups = stockGroups(state, { sections: [], items: [] });
    expect(groups.map((g) => g.label)).toEqual(['Minérios']);
  });

  it('keepsOnlyTheAllowedChoices', () => {
    const groups = stockGroups(state, depot, {
      allows: (key) => key !== 'd:cavalo' && key !== 'm:wood',
    });
    expect(labels(groups)).toEqual([
      ['Depósito › Ervas', ['d:ferro=Ferro (Depósito) ×1']],
      ['Minérios', ['m:iron=Ferro', 'm:aetherium=Aetherium']],
    ]);
  });

  it('putsTheMaterialCategoriesInTheGivenOrder', () => {
    const many = {
      ...state,
      materials: {
        categories: [
          { id: 'a', name: 'Gerais' },
          { id: 'p', name: 'porções' },
        ],
        items: [
          { id: 'x', name: 'X', category: 'a', quantity: 0 },
          { id: 'y', name: 'Y', category: 'p', quantity: 0 },
          { id: 'z', name: 'Z', category: 'gone', quantity: 0 },
        ],
      },
    };
    const groups = stockGroups(many, { sections: [], items: [] }, { categoriesFirst: ['p'] });
    expect(groups.map((g) => g.label)).toEqual(['porções', 'Gerais', 'Sem categoria']);
  });
});
