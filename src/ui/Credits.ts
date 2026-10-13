import { z } from 'zod';
import { t } from '../i18n/pt-BR';
import { el } from './dom';

const creditSchema = z.object({
  id: z.string().min(1),
  work: z.string().min(1),
  source: z.string().min(1),
  /** Empty until filled in by hand (the Freepik page, for instance). */
  url: z.union([z.url(), z.literal('')]),
  license: z.string().min(1),
  author: z.string(),
  /** Shows a reminder while the author is still blank. */
  requiresAttribution: z.boolean(),
  usedFor: z.string(),
});

/** One layer of an LPC character (body, hair, shield…), as listed in its credits.csv. */
const spriteLayerSchema = z.object({
  part: z.string().min(1),
  notes: z.string(),
  authors: z.array(z.string().min(1)).min(1),
  licenses: z.array(z.string().min(1)).min(1),
  urls: z.array(z.url()),
});

/** A walking NPC sprite, written by `npm run import:npcs`. */
const spriteCreditSchema = z.object({
  id: z.string().min(1),
  work: z.string().min(1),
  source: z.string().min(1),
  url: z.url(),
  usedFor: z.string(),
  layers: z.array(spriteLayerSchema).min(1),
});

export const creditsSchema = z.object({
  textures: z.array(creditSchema),
  sprites: z.array(spriteCreditSchema).default([]),
});

export type Credits = z.infer<typeof creditsSchema>;
type Credit = Credits['textures'][number];
type SpriteCredit = Credits['sprites'][number];
type SpriteLayer = SpriteCredit['layers'][number];

export function parseCredits(raw: unknown): Credits {
  const result = creditsSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid credits.json:\n${z.prettifyError(result.error)}`);
  return result.data;
}

/** Native <dialog> listing the third-party works used by the game and their licenses. */
export function showCredits(credits: Credits): void {
  const dialog = el(
    'dialog',
    { class: 'dialog dialog--credits' },
    el('h2', { class: 'panel__title' }, t.credits.title),
    el('h3', { class: 'section-title' }, t.credits.textures),
    el('ul', { class: 'credits' }, ...credits.textures.map(creditItem)),
    credits.sprites.length > 0 && el('h3', { class: 'section-title' }, t.credits.sprites),
    credits.sprites.length > 0 &&
      el('ul', { class: 'credits' }, ...credits.sprites.map(spriteItem)),
    el(
      'div',
      { class: 'row row--end' },
      el(
        'button',
        { class: 'btn btn--primary', type: 'button', onclick: () => dialog.close() },
        t.credits.close,
      ),
    ),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

function creditItem(credit: Credit): HTMLElement {
  const source = credit.url
    ? el('a', { href: credit.url, target: '_blank', rel: 'noopener noreferrer' }, credit.source)
    : el('span', {}, credit.source);
  return el(
    'li',
    { class: 'credits__item' },
    el('strong', {}, credit.work),
    el('span', {}, source, ' · ', t.credits.license(credit.license)),
    credit.author
      ? el('span', {}, t.credits.by(credit.author))
      : credit.requiresAttribution && el('span', { class: 'notice' }, t.credits.authorMissing),
    el('span', { class: 'credits__use' }, credit.usedFor),
  );
}

function spriteItem(credit: SpriteCredit): HTMLElement {
  return el(
    'li',
    { class: 'credits__item' },
    el('strong', {}, credit.work),
    el(
      'span',
      {},
      el('a', { href: credit.url, target: '_blank', rel: 'noopener noreferrer' }, credit.source),
    ),
    el('span', { class: 'credits__use' }, credit.usedFor),
    el('ul', { class: 'credits__layers' }, ...credit.layers.map(layerItem)),
  );
}

function layerItem(layer: SpriteLayer): HTMLElement {
  const links = layer.urls.flatMap((url, i) => [
    i === 0 ? ' · ' : ', ',
    el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, t.credits.link(i + 1)),
  ]);
  return el(
    'li',
    {},
    el('code', {}, layer.part),
    el('span', {}, t.credits.authors(layer.authors.join(', '))),
    el('span', {}, t.credits.license(layer.licenses.join(' / ')), ...links),
  );
}
