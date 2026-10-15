import { jobEffectText, t, type TextContext } from '../i18n/pt-BR';
import type { BuildingDef, BuildingLevel, JobDef } from '../model/schema';
import { el } from './dom';

export interface DetailsOptions {
  def: BuildingDef;
  ctx: TextContext;
  /** Level in force (0 when not built); its block is highlighted. */
  currentLevel: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** Cost line, checked against the current stock by the caller. */
  costOf: (level: BuildingLevel) => HTMLElement;
}

/**
 * Requirements, posts and housing a level brings. The building-wide requirement
 * shows on level 1 only: it is met before anything stands.
 */
export function levelFacts(def: BuildingDef, levelIndex: number, ctx: TextContext): string[] {
  const level = def.levels[levelIndex];
  if (!level) return [];
  const requires = [...(levelIndex === 0 ? (def.requires ?? []) : []), ...(level.requires ?? [])];
  return [
    ...requires.map((r) => t.details.requires(ctx.building(r.building), r.minLevel)),
    ...(level.jobs ?? []).map((job) => postText(job, ctx)),
    ...(level.housing ? [t.details.housing(level.housing.capacity)] : []),
  ];
}

/** A bonus post reads as its own text; the others show the yield of an NPC with skill 0. */
function postText(job: JobDef, ctx: TextContext): string {
  const { effect } = job;
  if (effect.type === 'bonus') return t.details.post(job.name, effect.text);
  return t.details.postBase(job.name, jobEffectText(effect, effect.perDay * 10, ctx));
}

/** Party and Axis side by side (stacked on phones); an unwritten text reads "a definir". */
export function abilityColumns(level: Pick<BuildingLevel, 'party' | 'axis'>): HTMLElement {
  return el(
    'div',
    { class: 'abilities' },
    abilityColumn(t.details.party, level.party),
    abilityColumn(t.details.axis, level.axis),
  );
}

function abilityColumn(label: string, text: string): HTMLElement {
  return el(
    'div',
    { class: 'abilities__column' },
    el('span', { class: 'stat__label' }, label),
    el(
      'p',
      { class: text ? 'abilities__text' : 'abilities__text is-unwritten' },
      text || t.details.unwritten,
    ),
  );
}

/** "Detalhes": every level with its abilities, cost, time and facts. */
export function buildingDetails(options: DetailsOptions): HTMLDetailsElement {
  const node = el(
    'details',
    { class: 'details', open: options.open },
    el('summary', { class: 'details__toggle' }, t.details.toggle),
    ...options.def.levels.map((level, index) => levelBlock(options, level, index)),
  );
  node.addEventListener('toggle', () => options.onToggle(node.open));
  return node;
}

function levelBlock(options: DetailsOptions, level: BuildingLevel, index: number): HTMLElement {
  const facts = levelFacts(options.def, index, options.ctx);
  const isCurrent = index + 1 === options.currentLevel;
  return el(
    'section',
    { class: isCurrent ? 'details__level is-current' : 'details__level' },
    el('h4', { class: 'details__title' }, t.details.level(index + 1)),
    abilityColumns(level),
    el(
      'p',
      { class: 'stat' },
      el('span', { class: 'stat__label' }, t.panel.cost),
      options.costOf(level),
    ),
    el(
      'p',
      { class: 'stat' },
      el('span', { class: 'stat__label' }, t.panel.time),
      level.buildTime === 0 ? t.instant : t.days(level.buildTime),
    ),
    facts.length > 0 && el('ul', { class: 'effects' }, ...facts.map((fact) => el('li', {}, fact))),
  );
}
