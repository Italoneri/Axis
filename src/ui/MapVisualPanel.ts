import { t } from '../i18n/pt-BR';
import type { BuildingPreview } from '../map/buildingPreview';
import type { LiveMap, MapTimings } from '../map/liveMap';
import { serializeTheme, type MapTheme, type NumericThemeKey, type ThemeStore } from '../map/theme';
import { findBuilding, type Catalog } from '../model/catalog';
import { el } from './dom';
import { downloadText } from './download';
import { field, section } from './widgets';

interface Slider {
  readonly key: NumericThemeKey;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Slider ranges match the limits in themeSchema. */
const GROUPS: { title: string; sliders: Slider[]; withGoldColor?: boolean }[] = [
  {
    title: t.mapVisual.veinsSection,
    withGoldColor: true,
    sliders: [
      { key: 'floorVeins', min: 0, max: 1, step: 0.01 },
      { key: 'wallVeins', min: 0, max: 1, step: 0.01 },
      { key: 'veinCopies', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: t.mapVisual.discSection,
    sliders: [
      { key: 'discHueShift', min: -180, max: 180, step: 1 },
      { key: 'discBrightness', min: 0.3, max: 2, step: 0.01 },
    ],
  },
  {
    title: t.mapVisual.wallSection,
    sliders: [
      { key: 'wallDesaturation', min: 0, max: 1, step: 0.01 },
      { key: 'wallWarmth', min: 0, max: 3, step: 0.05 },
      { key: 'floorScale', min: 0.1, max: 1, step: 0.01 },
      { key: 'innerShadow', min: 0, max: 1, step: 0.01 },
    ],
  },
  {
    title: t.mapVisual.prismsSection,
    sliders: [
      { key: 'prismGlow', min: 0, max: 1, step: 0.01 },
      { key: 'prismPulseSeconds', min: 0.5, max: 10, step: 0.1 },
    ],
  },
];

/**
 * Content of the master's "Visual do mapa" drawer tab. Inputs update the theme
 * in place (the drawer is not re-rendered), so a slider keeps its drag.
 */
export function renderMapVisual(
  liveMap: LiveMap,
  catalog: Catalog,
  preview: BuildingPreview,
): HTMLElement[] {
  const { theme } = liveMap;
  const dirty = el('p', { class: 'notice', hidden: !theme.isDirty }, t.mapVisual.edited);
  whileShown(dirty, theme, () => (dirty.hidden = !theme.isDirty));
  return [
    el('p', { class: 'panel__hint' }, t.mapVisual.hint),
    timingsLine(liveMap),
    dirty,
    ...(import.meta.env.DEV ? [referenceField(liveMap)] : []),
    previewSection(catalog, preview),
    ...GROUPS.map((group) =>
      section(
        group.title,
        group.withGoldColor === true && goldColorField(liveMap),
        ...group.sliders.map((slider) => sliderField(liveMap, slider)),
      ),
    ),
    el(
      'div',
      { class: 'row row--wrap' },
      el(
        'button',
        {
          class: 'btn btn--primary',
          type: 'button',
          onclick: () => downloadText('theme.json', serializeTheme(theme.current)),
        },
        t.mapVisual.export,
      ),
      el(
        'button',
        { class: 'btn', type: 'button', onclick: () => theme.reset() },
        t.mapVisual.reset,
      ),
    ),
  ];
}

/**
 * Puts any building, at any level, on any compatible slot, on screen only, so new
 * art can be checked everywhere before it is saved. Every change applies at once.
 */
function previewSection(catalog: Catalog, preview: BuildingPreview): HTMLElement {
  const current = preview.current;
  const building = el(
    'select',
    { class: 'input' },
    ...catalog.buildings.map((b) =>
      el('option', { value: b.id, selected: b.id === current?.buildingId }, b.name),
    ),
  );
  const level = el('select', { class: 'input' });
  const slot = el('select', { class: 'input' });

  const fillChoices = () => {
    const def = findBuilding(catalog, building.value);
    level.replaceChildren(
      ...(def?.levels ?? []).map((_, i) => el('option', { value: String(i + 1) }, t.level(i + 1))),
    );
    slot.replaceChildren(
      ...catalog.layout.slots
        .filter((s) => def?.allowedSlots.includes(s.type))
        .map((s) => el('option', { value: s.id }, `${s.id} · ${t.slotTypes[s.type]}`)),
    );
  };
  const apply = () => {
    if (!slot.value) return;
    preview.show({ buildingId: building.value, level: Number(level.value), slotId: slot.value });
  };

  fillChoices();
  if (current) {
    level.value = String(current.level);
    slot.value = current.slotId;
  }
  building.addEventListener('change', () => {
    fillChoices();
    apply();
  });
  level.addEventListener('change', apply);
  slot.addEventListener('change', apply);

  return section(
    t.mapVisual.previewSection,
    el('p', { class: 'panel__hint' }, t.mapVisual.previewHint),
    field(t.mapVisual.previewBuilding, building),
    field(t.mapVisual.previewLevel, level),
    field(t.mapVisual.previewSlot, slot),
    el(
      'div',
      { class: 'row row--wrap' },
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', onclick: apply },
        t.mapVisual.previewShow,
      ),
      el(
        'button',
        { class: 'btn', type: 'button', onclick: () => preview.clear() },
        t.mapVisual.previewClear,
      ),
    ),
  );
}

function sliderField(liveMap: LiveMap, { key, min, max, step }: Slider): HTMLElement {
  const { theme } = liveMap;
  const value = () => String(theme.current[key]);
  const output = el('output', { class: 'slider__value' }, value());
  const input = el('input', {
    class: 'slider__input',
    type: 'range',
    min: String(min),
    max: String(max),
    step: String(step),
    value: value(),
    'aria-label': t.mapVisual[key],
  });
  input.addEventListener('input', () => {
    output.textContent = input.value;
    theme.setValue(key, Number(input.value));
  });
  // "Restaurar padrão" moves the sliders back without re-rendering the drawer.
  whileShown(input, theme, (current) => {
    if (document.activeElement === input) return;
    input.value = String(current[key]);
    output.textContent = input.value;
  });
  return el(
    'label',
    { class: 'slider' },
    el('span', { class: 'slider__label' }, t.mapVisual[key]),
    input,
    output,
  );
}

/** Dev only: fades docs/map-reference/axis_preview.jpg over the map for a side-by-side check. */
function referenceField(liveMap: LiveMap): HTMLElement {
  const output = el('output', { class: 'slider__value' }, String(liveMap.referenceOpacity));
  const input = el('input', {
    class: 'slider__input',
    type: 'range',
    min: '0',
    max: '1',
    step: '0.05',
    value: String(liveMap.referenceOpacity),
    'aria-label': t.mapVisual.reference,
  });
  input.addEventListener('input', () => {
    output.textContent = input.value;
    liveMap.setReferenceOpacity(Number(input.value));
  });
  return el(
    'label',
    { class: 'slider card' },
    el('span', { class: 'slider__label' }, t.mapVisual.reference),
    input,
    output,
  );
}

function goldColorField({ theme }: LiveMap): HTMLElement {
  const input = el('input', { class: 'input', type: 'color', value: theme.current.goldColor });
  input.addEventListener('input', () => theme.setValue('goldColor', input.value));
  whileShown(input, theme, (current) => (input.value = current.goldColor));
  return el('label', { class: 'field' }, t.mapVisual.goldColor, input);
}

/** Generation time, refreshed after every repaint while the line is on screen. */
function timingsLine(liveMap: LiveMap): HTMLElement {
  const text = ({ analysisMs, renderMs }: MapTimings) =>
    t.mapVisual.timings(liveMap.size, analysisMs, renderMs);
  const line = el('p', { class: 'panel__hint' }, text(liveMap.timings));
  const stop = liveMap.onRendered((timings) => {
    if (!line.isConnected) return stop();
    line.textContent = text(timings);
  });
  return line;
}

/** Follows theme changes until the drawer replaces `node`, then lets go of the listener. */
function whileShown(node: Element, theme: ThemeStore, listener: (theme: MapTheme) => void): void {
  const stop = theme.subscribe((current) => {
    if (node.isConnected) listener(current);
    else stop();
  });
}
