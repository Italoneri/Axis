import { t } from '../i18n/pt-BR';
import type { Character } from '../model/schema';
import type { GameStore } from '../store';
import { type CharacterFields } from '../systems/Characters';
import { newId } from '../commands/newId';
import { el } from './dom';
import type { MasterAccess } from './MasterSession';
import { confirmButton, field, section, thumb, type Act } from './widgets';

const DEFAULT_COLOR = '#c0703a';

/**
 * Content of the "Mestre" drawer tab: time and characters.
 * Coins, materials, research and influence are edited in their top bar dropdowns.
 */
export function renderMasterTools(
  store: GameStore,
  {
    session,
    act,
    openArchive,
  }: { session: MasterAccess; act: Act; openArchive?: (() => void) | undefined },
): HTMLElement[] {
  return [
    timeSection(store),
    charactersSection(store, act),
    ...(openArchive
      ? [
          section(
            t.archive.title,
            el('p', { class: 'panel__hint' }, t.archive.panelHint),
            el('button', { class: 'btn', type: 'button', onclick: openArchive }, t.archive.open),
          ),
        ]
      : []),
    el('p', { class: 'panel__hint' }, t.master.buildingsHint),
    el(
      'button',
      { class: 'btn', type: 'button', onclick: () => session.lock() },
      session.leaveLabel,
    ),
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
    if (count >= 1) store.dispatch({ type: 'advance_days', days: count });
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
        characterForm(character, (fields) =>
          act({ type: 'update_character', characterId: character.id, ...fields }),
        ),
        confirmButton(t.common.remove, () =>
          act({ type: 'remove_character', characterId: character.id }),
        ),
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
      characterForm(undefined, (fields) =>
        act({ type: 'add_character', id: newId('char'), ...fields }),
      ),
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
