import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import type { GameState, ResearchStatus } from '../../model/schema';
import { filterResearch, type ResearchFilter } from '../../systems/Research';
import { el } from '../dom';
import { researchSheet, researchSummary } from './researchViews';

/**
 * "Arquivo de Pesquisas" in the study station's side panel: every research with
 * its full record, filterable by status and category and searchable by title.
 * Filters survive re-renders; typing only redraws the list so focus stays put.
 */
export class ResearchArchive {
  private filter: ResearchFilter = { status: 'all', category: 'all', query: '' };
  private readonly expanded = new Set<string>();

  render(catalog: Catalog, state: GameState): HTMLElement {
    const list = el('ul', { class: 'item-list' });
    const drawList = () => list.replaceChildren(...this.items(catalog, state));

    const statusSelect = el(
      'select',
      { class: 'input', 'aria-label': t.research.status },
      el('option', { value: 'all' }, t.research.allStatuses),
      ...(['em_andamento', 'concluida'] as const).map((s) =>
        el('option', { value: s, selected: s === this.filter.status }, t.research.statusOptions[s]),
      ),
    );
    const categorySelect = el(
      'select',
      { class: 'input', 'aria-label': t.common.category },
      el('option', { value: 'all' }, t.research.allCategories),
      ...state.research.categories.map((c) =>
        el('option', { value: c.id, selected: c.id === this.filter.category }, c.name),
      ),
    );
    const search = el('input', {
      class: 'input input--wide',
      type: 'search',
      placeholder: t.research.search,
      'aria-label': t.research.search,
      value: this.filter.query,
    });

    const onFilter = () => {
      this.filter = {
        status: parseStatus(statusSelect.value),
        category: categorySelect.value,
        query: search.value,
      };
      drawList();
    };
    statusSelect.addEventListener('change', onFilter);
    categorySelect.addEventListener('change', onFilter);
    search.addEventListener('input', onFilter);
    list.addEventListener('click', (event) => {
      const target =
        event.target instanceof Element ? event.target.closest('[data-research]') : null;
      const id = target?.getAttribute('data-research');
      if (!id) return;
      if (this.expanded.has(id)) this.expanded.delete(id);
      else this.expanded.add(id);
      drawList();
    });
    drawList();

    return el(
      'section',
      { class: 'card' },
      el('h3', { class: 'section-title' }, t.research.archiveTitle),
      el('div', { class: 'row row--wrap' }, statusSelect, categorySelect),
      search,
      list,
    );
  }

  private items(catalog: Catalog, state: GameState): HTMLElement[] {
    const entries = filterResearch(state.research.entries, this.filter);
    if (entries.length === 0) return [el('li', { class: 'panel__hint' }, t.research.empty)];
    return entries.map((entry) => {
      const isOpen = this.expanded.has(entry.id);
      return el(
        'li',
        { class: 'item research' },
        el(
          'button',
          {
            class: 'research__toggle',
            type: 'button',
            'data-research': entry.id,
            'aria-expanded': String(isOpen),
          },
          ...researchSummary(state.research, entry),
        ),
        isOpen && researchSheet(catalog, state, entry),
      );
    });
  }
}

function parseStatus(value: string): ResearchStatus | 'all' {
  return value === 'em_andamento' || value === 'concluida' ? value : 'all';
}
