import { t } from '../../i18n/pt-BR';
import { resolveImage, type Catalog } from '../../model/catalog';
import { NPC_HIDDEN_SPRITE, type Npc } from '../../model/schema';
import {
  isMissingSprite,
  sheetKeys,
  spriteFor,
  spriteLabel,
  spriteNames,
  type SpriteOverrides,
} from '../../map/npcSprites';
import { el } from '../dom';

/** Radio value of the automatic pick (a sprite name is never empty). */
const AUTOMATIC = '';

export interface SpriteSource {
  readonly catalog: Catalog;
  readonly overrides: SpriteOverrides;
}

/**
 * "Aparência no mapa": a card per registered sprite with its walk looping,
 * plus the automatic pick and "not on the map". `read` gives `null` for the
 * automatic pick, which the commands store as no choice.
 */
export function spriteField(source: SpriteSource, npc: Pick<Npc, 'id' | 'sprite'>) {
  const names = spriteNames(source.catalog.assets);
  const current = npc.sprite ?? AUTOMATIC;
  const group = `npc-sprite-${npc.id}`;
  const automatic = spriteFor({ id: npc.id }, names, source.overrides);
  const missing = isMissingSprite(npc.sprite, names) ? npc.sprite : undefined;
  const options = [
    { value: AUTOMATIC, label: t.npcs.spriteAutomatic, preview: automatic },
    { value: NPC_HIDDEN_SPRITE, label: t.npcs.spriteHidden, preview: undefined },
    ...names.map((name) => ({ value: name, label: spriteLabel(name), preview: name })),
    ...(missing
      ? [{ value: missing, label: t.npcs.spriteMissing(missing), preview: undefined }]
      : []),
  ];
  const radios = options.map((option) =>
    el('input', {
      type: 'radio',
      name: group,
      value: option.value,
      checked: option.value === current,
      class: 'sprite-option__radio',
    }),
  );
  const element = el(
    'fieldset',
    { class: 'sprite-picker' },
    el('legend', { class: 'section-title' }, t.npcs.sprite),
    missing && el('p', { class: 'panel__hint' }, t.npcs.spriteMissingHint),
    el(
      'div',
      { class: 'sprite-picker__grid' },
      ...options.map((option, index) =>
        el(
          'label',
          { class: 'sprite-option' },
          radios[index],
          option.preview
            ? spriteFigure(source.catalog, option.preview, 'walking')
            : el('span', { class: 'npc-sprite npc-sprite--empty', 'aria-hidden': 'true' }, '∅'),
          el('span', { class: 'sprite-option__name' }, option.label),
        ),
      ),
    ),
  );
  const read = (): string | null => {
    const value = radios.find((radio) => radio.checked)?.value ?? AUTOMATIC;
    return value === AUTOMATIC ? null : value;
  };
  return { element, read };
}

/** The NPC's look on the map, standing and facing front; nothing when it is kept off the map. */
export function spriteThumb(source: SpriteSource, npc: Pick<Npc, 'id' | 'sprite'>) {
  const name = spriteFor(npc, spriteNames(source.catalog.assets), source.overrides);
  return name ? spriteFigure(source.catalog, name, 'standing', 'small') : null;
}

/** One frame of the walk sheet's front-facing row, cropped with CSS (see .npc-sprite). */
function spriteFigure(
  catalog: Catalog,
  name: string,
  pose: 'walking' | 'standing',
  size: 'small' | 'large' = 'large',
): HTMLElement {
  const url = resolveImage(catalog, sheetKeys(name).walk) ?? '';
  return el(
    'span',
    { class: `npc-sprite npc-sprite--${size}`, 'aria-hidden': 'true' },
    el('span', {
      class: `npc-sprite__sheet npc-sprite__sheet--${pose}`,
      style: `background-image: url("${url}")`,
    }),
  );
}
