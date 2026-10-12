import { BODY_LIMIT, TITLE_LIMIT } from './Archive';

/** A line of 5 or more dashes: how the records were separated on Discord. */
const SEPARATOR = /^[ \t]*-{5,}[ \t]*$/;
/** Blank lines before the first and after the last line with text; its indent stays. */
const BLANK_EDGES = /^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g;
export const DEFAULT_TITLE_PREFIX = 'Registro';

export interface PastedText {
  /** The whole block as pasted, marks included; only blank edge lines are cut. */
  body: string;
  /** The text is over the limit: the preview flags it and nothing is saved. */
  isTooLong: boolean;
}

export interface PastedRecord extends PastedText {
  title: string;
}

/** Splits a big paste into the texts of its records; blank blocks are skipped. */
export function splitPastedRecords(text: string): PastedText[] {
  const chunks: string[][] = [[]];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (SEPARATOR.test(line)) chunks.push([]);
    else chunks.at(-1)?.push(line);
  }
  return chunks.flatMap((lines) => {
    const body = lines.join('\n').replace(BLANK_EDGES, '');
    if (!body.trim()) return [];
    return [{ body, isTooLong: body.length > BODY_LIMIT }];
  });
}

/** `Registro 5`, or `5` with no prefix. */
export function numberedTitle(prefix: string, number: number): string {
  const label = prefix.trim();
  const title = label ? `${label} ${number}` : String(number);
  return title.length > TITLE_LIMIT ? title.slice(-TITLE_LIMIT) : title;
}

/**
 * The number after the highest `<prefix> N` among the topic's titles. Pass the
 * trashed notes too, so a restored note never shares a number.
 */
export function nextRecordNumber(titles: readonly string[], prefix: string): number {
  const label = prefix.trim();
  const pattern = new RegExp(label ? `^${escapeRegExp(label)}\\s+(\\d+)$` : '^(\\d+)$');
  const numbers = titles.map((title) => Number(pattern.exec(title.trim())?.[1] ?? 0));
  return Math.max(0, ...numbers) + 1;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
