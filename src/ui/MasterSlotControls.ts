import { t } from '../i18n/pt-BR';
import type { BuildingDef, PlacedBuilding, SlotDef } from '../model/schema';
import type { GameStore } from '../store';
import { el } from './dom';

const CONFIRM_WINDOW_MS = 3000;

/** Master-only card in the slot panel: force any building/level, finish now, or remove. */
export function renderMasterSlotControls(
  store: GameStore,
  slot: SlotDef,
  placed: PlacedBuilding | undefined,
): HTMLElement {
  const options = store.catalog.buildings.filter((b) => b.allowedSlots.includes(slot.type));
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
    store.forceBuilding({
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
            store.forceBuilding({
              slotId: slot.id,
              buildingId: placed.buildingId,
              level: placed.level,
            }),
        },
        t.master.completeNow,
      ),
    placed && removeButton(() => store.removeBuilding(slot.id)),
  );
}

/** Two-step button: the first click arms it, a second click within a few seconds confirms. */
function removeButton(onConfirm: () => void): HTMLButtonElement {
  let armedUntil = 0;
  const button = el('button', { class: 'btn btn--danger', type: 'button' }, t.master.remove);
  button.addEventListener('click', () => {
    if (Date.now() < armedUntil) return onConfirm();
    armedUntil = Date.now() + CONFIRM_WINDOW_MS;
    button.textContent = t.master.confirmRemove;
    setTimeout(() => (button.textContent = t.master.remove), CONFIRM_WINDOW_MS);
  });
  return button;
}
