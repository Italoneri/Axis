import { t } from '../i18n/pt-BR';
import type { SlotEditor } from '../slotEditor';
import type { GameStore } from '../store';
import { serializeSlots } from '../systems/SlotLayout';
import { el } from './dom';
import { downloadText } from './download';
import type { MasterSession } from './MasterSession';

/** Content of the "Mestre" drawer tab: time, resources and the slot editor. */
export function renderMasterTools(
  store: GameStore,
  session: MasterSession,
  editor: SlotEditor,
): HTMLElement[] {
  return [
    timeSection(store),
    resourcesSection(store),
    slotsSection(editor),
    el('p', { class: 'panel__hint' }, t.master.buildingsHint),
    el('button', { class: 'btn', type: 'button', onclick: () => session.lock() }, t.master.leave),
  ];
}

function timeSection(store: GameStore): HTMLElement {
  const days = el('input', {
    class: 'input',
    type: 'number',
    min: '1',
    step: '1',
    value: '1',
    'aria-label': t.master.daysToAdvance,
  });
  const advance = () => {
    const count = Math.floor(Number(days.value));
    if (count >= 1) store.advanceDays(count);
  };
  return section(
    t.master.timeSection,
    el(
      'div',
      { class: 'row' },
      el('label', { class: 'row__label' }, t.master.daysToAdvance, days),
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', onclick: advance },
        t.master.advance,
      ),
    ),
  );
}

function resourcesSection(store: GameStore): HTMLElement {
  const { catalog } = store;
  const inputs = catalog.resources.map((resource) => ({
    id: resource.id,
    input: el('input', { class: 'input', type: 'number', min: '0', step: '1', placeholder: '0' }),
    resource,
  }));

  const apply = (sign: 1 | -1) => {
    const delta = Object.fromEntries(
      inputs
        .map(
          ({ id, input }) =>
            [id, sign * Math.max(0, Math.floor(Number(input.value) || 0))] as const,
        )
        .filter(([, amount]) => amount !== 0),
    );
    store.adjustResources(delta);
    inputs.forEach(({ input }) => (input.value = ''));
  };

  return section(
    t.master.resourcesSection,
    el('p', { class: 'panel__hint' }, t.master.resourcesHint),
    ...inputs.map(({ input, resource }) =>
      el(
        'label',
        { class: 'row' },
        el('img', { class: 'row__icon', src: catalog.assets.images[resource.icon] ?? '', alt: '' }),
        el('span', { class: 'row__name' }, resource.name),
        input,
      ),
    ),
    el(
      'div',
      { class: 'row row--end' },
      el('button', { class: 'btn', type: 'button', onclick: () => apply(-1) }, t.master.take),
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', onclick: () => apply(1) },
        t.master.give,
      ),
    ),
  );
}

function slotsSection(editor: SlotEditor): HTMLElement {
  return section(
    t.master.slotsSection,
    el('p', { class: 'panel__hint' }, t.master.slotsHint),
    editor.isDirty && el('p', { class: 'notice' }, t.master.slotsEdited),
    el(
      'div',
      { class: 'row row--wrap' },
      el(
        'button',
        {
          class: editor.isEditing ? 'btn btn--primary' : 'btn',
          type: 'button',
          'aria-pressed': String(editor.isEditing),
          onclick: () => editor.setEditing(!editor.isEditing),
        },
        editor.isEditing ? t.master.stopEditing : t.master.editSlots,
      ),
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () => downloadText('slots.json', serializeSlots(editor.layout)),
        },
        t.master.exportSlots,
      ),
      el(
        'button',
        { class: 'btn', type: 'button', disabled: !editor.isDirty, onclick: () => editor.reset() },
        t.master.resetSlots,
      ),
    ),
  );
}

function section(title: string, ...children: (HTMLElement | false)[]): HTMLElement {
  return el('section', { class: 'card' }, el('h3', { class: 'section-title' }, title), ...children);
}
