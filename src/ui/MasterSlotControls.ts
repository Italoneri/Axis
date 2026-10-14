import { t } from '../i18n/pt-BR';
import type { SlotDef } from '../map/layout';
import type { BuildingDef, PlacedBuilding } from '../model/schema';
import type { GameStore } from '../store';
import { el } from './dom';
import { confirmButton } from './widgets';

/** Master-only card in the slot panel: force any building/level, finish now, or remove. */
export function renderMasterSlotControls(
  store: GameStore,
  slot: SlotDef,
  placed: PlacedBuilding | undefined,
): HTMLElement {
  // A building from an older save may stand where its slot type is no longer allowed
  // (the Depósito used to go on the wall); it stays listed so the master can still manage it.
  const options = store.catalog.buildings.filter(
    (b) => b.allowedSlots.includes(slot.type) || b.id === placed?.buildingId,
  );
  const initial = options.find((b) => b.id === placed?.buildingId) ?? options[0];

  const buildingSelect = el(
    'select',
    { class: 'input', 'aria-label': t.panel.build },
    ...options.map((def) =>
      el('option', { value: def.id, selected: def.id === initial?.id }, def.name),
    ),
  );
  const levelSelect = el('select', { class: 'input', 'aria-label': t.master.forceLevel });
  const fillLevels = (def: BuildingDef | undefined, selectedLevel: number) =>
    levelSelect.replaceChildren(
      ...(def?.levels ?? []).map((_, i) =>
        el('option', { value: String(i + 1), selected: i + 1 === selectedLevel }, t.level(i + 1)),
      ),
    );
  fillLevels(initial, placed?.level ?? 1);
  buildingSelect.addEventListener('change', () =>
    fillLevels(
      options.find((b) => b.id === buildingSelect.value),
      1,
    ),
  );

  const force = () =>
    store.dispatch({
      type: 'force_building',
      slotId: slot.id,
      buildingId: buildingSelect.value,
      level: Number(levelSelect.value),
    });

  return el(
    'section',
    { class: 'card card--master' },
    el('h3', { class: 'section-title' }, t.master.forceSection),
    el(
      'div',
      { class: 'row row--wrap' },
      buildingSelect,
      levelSelect,
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', disabled: !initial, onclick: force },
        t.master.force,
      ),
    ),
    placed?.status === 'building' &&
      el(
        'button',
        {
          class: 'btn',
          type: 'button',
          onclick: () =>
            store.dispatch({
              type: 'force_building',
              slotId: slot.id,
              buildingId: placed.buildingId,
              level: placed.level,
            }),
        },
        t.master.completeNow,
      ),
    placed &&
      confirmButton(t.master.remove, () =>
        store.dispatch({ type: 'remove_building', slotId: slot.id }),
      ),
  );
}
