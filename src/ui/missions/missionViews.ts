import { t } from '../../i18n/pt-BR';
import type { Catalog } from '../../model/catalog';
import {
  MISSION_DESCRIPTION_LIMIT,
  MISSION_MAX_DAYS,
  MISSION_TITLE_LIMIT,
  missionDifficultySchema,
  type Mission,
  type MissionDifficulty,
} from '../../model/schema';
import { toBronze } from '../../systems/Coins';
import type { MissionFields } from '../../systems/Missions';
import { el } from '../dom';
import { formatCoins, formatGold } from '../format';
import { coinInputs, field, numberInput, selectInput } from '../widgets';
import { scrollLook } from './scrollLook';

const DIFFICULTIES = missionDifficultySchema.options;
const DEFAULT_DAYS = 3;
/** Characters of the description shown on the board; the rest is in the focused scroll. */
const SNIPPET_LENGTH = 180;

/** The scroll pinned to the board; a click (or Enter) brings it to the front. */
export function scrollCard(
  catalog: Catalog,
  mission: Mission,
  onOpen: (missionId: string) => void,
): HTMLElement {
  const look = scrollLook(mission.id);
  const open = () => onOpen(mission.id);
  const scroll = el(
    'article',
    {
      class: `mission-scroll mission-scroll--${look.paper}`,
      role: 'button',
      tabindex: '0',
      'aria-label': mission.title,
      onclick: open,
      onkeydown: (event: Event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        open();
      },
    },
    el('span', { class: 'mission-scroll__nail', 'aria-hidden': 'true' }),
    el('span', { class: 'mission-scroll__roll mission-scroll__roll--top', 'aria-hidden': 'true' }),
    el(
      'div',
      { class: 'mission-scroll__paper', style: `clip-path: ${look.edge}` },
      el('h3', { class: 'mission-scroll__title' }, mission.title),
      fieldLine(t.missions.requester, mission.requester),
      fieldLine(t.missions.location, mission.location),
      fieldLine(t.missions.description, snippet(mission.description), 'mission-scroll__snippet'),
      fieldLine(t.missions.reward, formatCoins(catalog, mission.reward)),
      mission.progress.status !== 'aberta' &&
        el('p', { class: 'mission-scroll__stamp' }, t.missions.status[mission.progress.status]),
    ),
    el('span', {
      class: 'mission-scroll__roll mission-scroll__roll--bottom',
      'aria-hidden': 'true',
    }),
    waxSeal(mission.difficulty),
  );
  return el(
    'li',
    { class: 'mission-pin', style: `--tilt: ${look.tiltDeg}deg; --drop: ${look.dropPx}px` },
    scroll,
  );
}

/** "Solicitante: Guilda dos Mineradores", the label underlined like the reference. */
export function fieldLine(label: string, value: string, extraClass = ''): HTMLElement | null {
  if (!value.trim()) return null;
  return el(
    'p',
    { class: `mission-scroll__line ${extraClass}`.trim() },
    el('span', { class: 'mission-scroll__label' }, `${label}:`),
    ` ${value}`,
  );
}

/** Green, yellow or red wax, by difficulty. */
export function waxSeal(difficulty: MissionDifficulty): HTMLElement {
  const label = t.missions.seal(t.missions.difficulties[difficulty]);
  return el('span', {
    class: `mission-seal mission-seal--${difficulty}`,
    role: 'img',
    'aria-label': label,
    title: label,
  });
}

export interface MissionFormOptions {
  catalog: Catalog;
  mission?: Mission | undefined;
  /** True when the command went through, so the form can close. */
  onSubmit: (fields: MissionFields) => boolean;
  onCancel?: () => void;
}

/** Create and edit form: the reward is typed with the usual coin fields. */
export function missionForm({ catalog, mission, onSubmit, onCancel }: MissionFormOptions) {
  const text = (value: string | undefined, label: string) =>
    el('input', {
      class: 'input input--wide',
      value: value ?? '',
      maxlength: String(MISSION_TITLE_LIMIT),
      'aria-label': label,
    });
  const title = text(mission?.title, t.missions.titleField);
  const requester = text(mission?.requester, t.missions.requester);
  const location = text(mission?.location, t.missions.location);
  const description = el('textarea', {
    class: 'input input--wide mission-form__description',
    rows: '5',
    maxlength: String(MISSION_DESCRIPTION_LIMIT),
    'aria-label': t.missions.description,
  });
  description.value = mission?.description ?? '';
  const total = el('strong', {}, rewardText(catalog, mission?.reward ?? {}));
  const reward = coinInputs(catalog, {
    ...(mission ? { initial: mission.reward } : {}),
    onInput: (coins) => (total.textContent = rewardText(catalog, coins)),
  });
  const days = numberInput({
    min: 1,
    max: MISSION_MAX_DAYS,
    value: mission?.days ?? DEFAULT_DAYS,
    label: t.missions.days,
  });
  const difficulty = selectInput({
    label: t.missions.difficulty,
    value: mission?.difficulty ?? 'media',
    options: DIFFICULTIES.map((d) => ({ value: d, label: t.missions.difficulties[d] })),
  });
  const read = (): MissionFields => ({
    title: title.value,
    requester: requester.value,
    location: location.value,
    description: description.value,
    reward: reward.read(),
    days: clampDays(Number(days.value)),
    difficulty: DIFFICULTIES.find((d) => d === difficulty.value) ?? 'media',
  });
  return el(
    'form',
    {
      class: 'subform mission-form',
      onsubmit: (event: Event) => {
        event.preventDefault();
        onSubmit(read());
      },
    },
    field(t.missions.titleField, title),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.missions.requester, requester),
      field(t.missions.location, location),
    ),
    field(t.missions.description, description),
    el('p', { class: 'panel__hint' }, t.missions.descriptionHint),
    el(
      'div',
      { class: 'field' },
      el('span', {}, t.missions.reward),
      reward.element,
      el('p', { class: 'coin-total' }, el('span', {}, t.missions.rewardTotal), total),
    ),
    el(
      'div',
      { class: 'row row--wrap' },
      field(t.missions.days, days),
      field(t.missions.difficulty, difficulty),
    ),
    el(
      'div',
      { class: 'row row--end' },
      onCancel &&
        el('button', { class: 'btn', type: 'button', onclick: onCancel }, t.common.cancel),
      el(
        'button',
        { class: 'btn btn--primary', type: 'submit' },
        mission ? t.common.save : t.missions.pin,
      ),
    ),
  );
}

function rewardText(catalog: Catalog, coins: Readonly<Record<string, number>>): string {
  return formatGold(catalog, toBronze(coins, catalog.currencies));
}

/** Plain text for the board: markdown marks dropped, cut at a word. */
function snippet(markdown: string): string {
  const plain = markdown
    .replace(/[*_~`>#|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= SNIPPET_LENGTH) return plain;
  const cut = plain.slice(0, SNIPPET_LENGTH);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : SNIPPET_LENGTH)}…`;
}

function clampDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAYS;
  return Math.min(MISSION_MAX_DAYS, Math.max(1, Math.round(value)));
}
