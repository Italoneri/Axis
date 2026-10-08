import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import type { Cost, GameState, Research, ResearchBook } from '../../model/schema';
import { costInBronze } from '../../systems/BuildSystem';
import { clampPercent } from '../../systems/Influence';
import type { ResearchDraft } from '../../systems/Research';
import { el } from '../dom';
import { textContext } from '../format';
import { button, field, numberInput, progressBar, readCount } from '../widgets';

// Research pieces shared by the top bar dropdown and the study station archive.

export function categoryName(book: ResearchBook, id: string): string {
  return book.categories.find((c) => c.id === id)?.name ?? id;
}

/** Title, category and progress: one line per research in lists. */
export function researchSummary(book: ResearchBook, entry: Research): HTMLElement[] {
  const head = el(
    'div',
    { class: 'research__head' },
    el('span', { class: 'research__title' }, entry.title),
    el('span', { class: 'research__category' }, categoryName(book, entry.category)),
  );
  if (entry.status !== 'em_andamento') return [head];
  return [
    head,
    el(
      'div',
      { class: 'research__progress' },
      progressBar(entry.progress / 100),
      el('span', {}, `${entry.progress}%`),
    ),
  ];
}

/** Full record: every field, with long texts keeping their line breaks. */
export function researchSheet(catalog: Catalog, state: GameState, entry: Research): HTMLElement {
  const stat = (label: string, value: string | undefined) =>
    value ? el('p', { class: 'stat' }, el('span', { class: 'stat__label' }, label), value) : null;
  const longText = (label: string, value: string) =>
    value.trim()
      ? el(
          'div',
          {},
          el('span', { class: 'stat__label' }, label),
          el('p', { class: 'longtext' }, value),
        )
      : null;
  return el(
    'div',
    { class: 'research__sheet' },
    stat(t.research.status, t.research.statusOptions[entry.status]),
    entry.startedOnDay !== undefined
      ? stat(t.research.startedOnDay, String(entry.startedOnDay))
      : null,
    entry.status === 'concluida' && entry.completedOnDay !== undefined
      ? stat(t.research.completedOnDay, String(entry.completedOnDay))
      : null,
    stat(t.research.owner, entry.owner),
    entry.cost ? stat(t.research.cost, costText(catalog, state, entry.cost)) : null,
    longText(t.research.description, entry.description),
    longText(t.research.notes, entry.notes),
  );
}

function costText(catalog: Catalog, state: GameState, cost: Cost): string {
  const ctx = textContext(catalog, state);
  const bronze = costInBronze(catalog, cost);
  return [
    ...(bronze > 0 ? [ctx.gold(bronze)] : []),
    ...Object.entries(cost.materials ?? {}).map(([id, amount]) => `${amount} ${ctx.material(id)}`),
  ].join(', ');
}

/** Master form to create or edit a research, including old finished ones. */
export function researchForm(
  state: GameState,
  entry: Research | undefined,
  { onSubmit, onCancel }: { onSubmit: (draft: ResearchDraft) => void; onCancel: () => void },
): HTMLElement {
  const { categories } = state.research;
  const text = (value = '') => el('input', { class: 'input input--wide', value });
  const area = (value = '') => {
    const node = el('textarea', { class: 'input input--wide', rows: '4' });
    node.value = value;
    return node;
  };
  const optionalDay = (value: number | undefined, label: string) =>
    numberInput({ min: 0, label, value });

  const title = text(entry?.title);
  const category = el(
    'select',
    { class: 'input' },
    ...categories.map((c) =>
      el('option', { value: c.id, selected: c.id === entry?.category }, c.name),
    ),
  );
  const status = el(
    'select',
    { class: 'input' },
    ...(['em_andamento', 'concluida'] as const).map((s) =>
      el(
        'option',
        { value: s, selected: s === (entry?.status ?? 'em_andamento') },
        t.research.statusOptions[s],
      ),
    ),
  );
  const progress = numberInput({
    min: 0,
    max: 100,
    label: t.research.progress,
    value: entry?.status === 'em_andamento' ? entry.progress : 0,
  });
  const startedOnDay = optionalDay(entry?.startedOnDay, t.research.startedOnDay);
  const completedOnDay = optionalDay(
    entry?.status === 'concluida' ? entry.completedOnDay : state.day,
    t.research.completedOnDay,
  );
  const ownerList = el(
    'datalist',
    { id: 'research-owners' },
    ...state.characters.map((c) => el('option', { value: c.name })),
  );
  const owner = el('input', {
    class: 'input input--wide',
    list: 'research-owners',
    value: entry?.owner ?? '',
  });
  const description = area(entry?.description);
  const notes = area(entry?.notes);
  const cost = costEditor(state, entry?.cost);

  const progressField = field(t.research.progress, progress);
  const completedField = field(t.research.completedOnDay, completedOnDay);
  const syncStatus = () => {
    progressField.hidden = status.value !== 'em_andamento';
    completedField.hidden = status.value !== 'concluida';
  };
  status.addEventListener('change', syncStatus);
  syncStatus();

  const readDraft = (): ResearchDraft => {
    const started = startedOnDay.value === '' ? undefined : readCount(startedOnDay);
    const costValue = cost.read();
    const base = {
      title: title.value,
      category: category.value,
      description: description.value,
      notes: notes.value,
      ...(started === undefined ? {} : { startedOnDay: started }),
      ...(owner.value.trim() ? { owner: owner.value.trim() } : {}),
      ...(costValue ? { cost: costValue } : {}),
    };
    if (status.value === 'concluida') {
      const done = completedOnDay.value === '' ? undefined : readCount(completedOnDay);
      return {
        ...base,
        status: 'concluida',
        ...(done === undefined ? {} : { completedOnDay: done }),
      };
    }
    return { ...base, status: 'em_andamento', progress: clampPercent(Number(progress.value)) };
  };

  return el(
    'form',
    {
      class: 'subform card--master',
      onsubmit: (event: Event) => {
        event.preventDefault();
        onSubmit(readDraft());
      },
    },
    field(t.research.title, title),
    field(t.common.category, category),
    el('div', { class: 'row row--wrap' }, field(t.research.status, status), progressField),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.research.startedOnDay, startedOnDay),
      completedField,
    ),
    field(t.research.owner, owner),
    ownerList,
    field(t.research.description, description),
    field(t.research.notes, notes),
    cost.element,
    el(
      'div',
      { class: 'row row--end' },
      button(t.common.cancel, onCancel),
      el(
        'button',
        { class: 'btn btn--primary', type: 'submit' },
        entry ? t.common.save : t.common.add,
      ),
    ),
  );
}

/** Coins plus material rows; reads back undefined when everything is blank. */
function costEditor(state: GameState, cost: Cost | undefined) {
  const { items } = state.materials;
  const coins = el('input', {
    class: 'input',
    type: 'number',
    min: '0',
    step: '0.01',
    value: cost && cost.coins > 0 ? String(cost.coins) : '',
    'aria-label': t.research.costCoins,
  });
  const rows = el('div', { class: 'cost-rows' });

  const addRow = (materialId = items[0]?.id ?? '', amount = 1) => {
    const isKnown = items.some((m) => m.id === materialId);
    const select = el(
      'select',
      { class: 'input' },
      ...items.map((m) => el('option', { value: m.id, selected: m.id === materialId }, m.name)),
      !isKnown && el('option', { value: materialId, selected: true }, materialId),
    );
    const quantity = numberInput({ min: 1, value: amount, label: t.materials.quantity });
    const row = el('div', { class: 'row', 'data-cost-row': '' }, select, quantity);
    row.append(button('×', () => row.remove(), { title: t.common.remove }));
    rows.append(row);
  };
  Object.entries(cost?.materials ?? {}).forEach(([id, amount]) => addRow(id, amount));

  const read = (): Cost | undefined => {
    const materials = [...rows.querySelectorAll('[data-cost-row]')].reduce<Record<string, number>>(
      (bag, row) => {
        const select = row.querySelector('select');
        const quantity = row.querySelector('input');
        if (!select || !quantity || !select.value) return bag;
        return { ...bag, [select.value]: (bag[select.value] ?? 0) + readCount(quantity) };
      },
      {},
    );
    const gold = Math.max(0, Number(coins.value) || 0);
    const hasMaterials = Object.values(materials).some((n) => n > 0);
    if (gold === 0 && !hasMaterials) return undefined;
    return { coins: gold, ...(hasMaterials ? { materials } : {}) };
  };

  const element = el(
    'fieldset',
    { class: 'fieldset' },
    el('legend', {}, t.research.cost),
    field(t.research.costCoins, coins),
    rows,
    items.length > 0 && button(t.research.addCostMaterial, () => addRow()),
  );
  return { element, read };
}
