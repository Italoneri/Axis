import { t } from '../i18n/pt-BR';
import type { Character } from '../model/schema';
import type { GameStore } from '../store';
import { type CharacterFields } from '../systems/Characters';
import { newId } from '../commands/newId';
import { el } from './dom';
import type { MasterAccess } from './MasterSession';
import { photoField, saveWithPhoto } from './photos/photoField';
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
    openMenu,
    openDepot,
    openShop,
  }: {
    session: MasterAccess;
    act: Act;
    openArchive?: (() => void) | undefined;
    openMenu?: (() => void) | undefined;
    openDepot?: (() => void) | undefined;
    openShop?: (() => void) | undefined;
  },
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
    ...(openDepot
      ? [
          section(
            t.depot.title,
            el('p', { class: 'panel__hint' }, t.depot.panelHint),
            el('button', { class: 'btn', type: 'button', onclick: openDepot }, t.depot.open),
          ),
        ]
      : []),
    ...(openShop
      ? [
          section(
            t.shop.title,
            el('p', { class: 'panel__hint' }, t.shop.panelHint),
            el('button', { class: 'btn', type: 'button', onclick: openShop }, t.shop.open),
          ),
        ]
      : []),
    ...(openMenu
      ? [
          section(
            t.menu.title,
            el('p', { class: 'panel__hint' }, t.menu.panelHint),
            el('button', { class: 'btn', type: 'button', onclick: openMenu }, t.menu.open),
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
          thumb(store, {
            image: character.portrait,
            name: character.name,
            color: character.color,
          }),
          el('span', { class: 'item-row__name' }, character.name),
        ),
        characterForm(store, character, (fields) =>
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
      characterForm(store, undefined, (fields, id) =>
        act({ type: 'add_character', id, ...fields }),
      ),
    ),
  );
}

/** `onSubmit` gets the id the photo was stored under: the character's, or a new one. */
function characterForm(
  store: GameStore,
  character: Character | undefined,
  onSubmit: (fields: CharacterFields, id: string) => boolean,
): HTMLElement {
  const id = character?.id ?? newId('char');
  const name = el('input', { class: 'input input--wide', value: character?.name ?? '' });
  const color = el('input', {
    class: 'input',
    type: 'color',
    value: character?.color ?? DEFAULT_COLOR,
  });
  const portrait = photoField({
    source: store,
    current: character?.portrait,
    name: character?.name ?? '',
    color: character?.color ?? DEFAULT_COLOR,
  });
  const form = el(
    'form',
    {
      class: 'subform',
      onsubmit: (event: Event) => {
        event.preventDefault();
        void saveWithPhoto(portrait, { kind: 'character', id }, (image) =>
          onSubmit({ name: name.value, color: color.value, portrait: image }, id),
        );
      },
    },
    field(t.common.name, name),
    field(t.common.color, color),
    el('div', { class: 'field' }, el('span', {}, t.characters.portrait), portrait.element),
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
  portrait.listenOn(form);
  return form;
}
