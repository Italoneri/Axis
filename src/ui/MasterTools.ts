import { t } from '../i18n/pt-BR';
import type { Character } from '../model/schema';
import type { SlotEditor } from '../slotEditor';
import type { GameStore } from '../store';
import {
  addCharacter,
  removeCharacter,
  updateCharacter,
  type CharacterFields,
} from '../systems/Characters';
import { serializeSlots } from '../systems/SlotLayout';
import { el } from './dom';
import { downloadText } from './download';
import type { MasterSession } from './MasterSession';
import { confirmButton, field, section, thumb, type Act } from './widgets';

const DEFAULT_COLOR = '#c0703a';

/**
 * Content of the "Mestre" drawer tab: time, characters and the slot editor.
 * Coins, materials, research and influence are edited in their top bar dropdowns.
 */
export function renderMasterTools(
  store: GameStore,
  { session, editor, act }: { session: MasterSession; editor: SlotEditor; act: Act },
): HTMLElement[] {
  return [
    timeSection(store),
    charactersSection(store, act),
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

function charactersSection(store: GameStore, act: Act): HTMLElement {
  const { catalog } = store;
  const rows = store.current.characters.map((character) =>
    el(
      'li',
      { class: 'item' },
      el(
        'details',
        {},
        el(
          'summary',
          { class: 'item-row' },
          thumb(catalog, {
            image: character.portrait,
            name: character.name,
            color: character.color,
          }),
          el('span', { class: 'item-row__name' }, character.name),
        ),
        characterForm(character, (fields) => act((s) => updateCharacter(s, character.id, fields))),
        confirmButton(t.common.remove, () => act((s) => removeCharacter(s, character.id))),
      ),
    ),
  );
  return section(
    t.master.charactersSection,
    el('p', { class: 'panel__hint' }, t.master.charactersHint),
    el('ul', { class: 'item-list' }, ...rows),
    el(
      'details',
      {},
      el('summary', { class: 'section-title' }, t.characters.newCharacter),
      characterForm(undefined, (fields) => act((s) => addCharacter(s, fields))),
    ),
  );
}

function characterForm(
  character: Character | undefined,
  onSubmit: (fields: CharacterFields) => void,
): HTMLElement {
  const name = el('input', { class: 'input input--wide', value: character?.name ?? '' });
  const color = el('input', {
    class: 'input',
    type: 'color',
    value: character?.color ?? DEFAULT_COLOR,
  });
  const portrait = el('input', { class: 'input input--wide', value: character?.portrait ?? '' });
  return el(
    'form',
    {
      class: 'subform',
      onsubmit: (event: Event) => {
        event.preventDefault();
        onSubmit({ name: name.value, color: color.value, portrait: portrait.value });
      },
    },
    field(t.common.name, name),
    field(t.common.color, color),
    field(t.characters.portrait, portrait),
    el(
      'div',
      { class: 'row row--end' },
      el(
        'button',
        { class: 'btn btn--primary', type: 'submit' },
        character ? t.common.save : t.common.add,
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
