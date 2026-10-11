import { BODY_LIMIT, TITLE_LIMIT } from './Archive';

/** A line of 5 or more dashes: how the records were separated on Discord. */
const SEPARATOR = /^[ \t]*-{5,}[ \t]*$/;
/** For a first line made only of marks, such as `****`. */
const UNTITLED = 'Registro sem título';

export interface PastedRecord {
  title: string;
  body: string;
  /** The text is over the limit: the preview flags it and nothing is saved. */
  isTooLong: boolean;
}

/**
 * Splits a big paste into records. Each one's title is its first non-empty
 * line without the `**` and leading `#` marks (cut at the title limit); the
 * rest is its text.
 */
export function splitPastedRecords(text: string): PastedRecord[] {
  const chunks: string[][] = [[]];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (SEPARATOR.test(line)) chunks.push([]);
    else chunks.at(-1)?.push(line);
  }
  return chunks.flatMap((lines) => {
    const start = lines.findIndex((line) => line.trim() !== '');
    const first = lines[start];
    if (first === undefined) return [];
    const body = lines
      .slice(start + 1)
      .join('\n')
      .trim();
    return [{ title: titleOf(first), body, isTooLong: body.length > BODY_LIMIT }];
  });
}

function titleOf(line: string): string {
  const plain = line
    .replace(/\*\*/g, '')
    .replace(/^\s*#{1,3}\s+/, '')
    .trim();
  if (!plain) return UNTITLED;
  return plain.length > TITLE_LIMIT ? `${plain.slice(0, TITLE_LIMIT - 1)}…` : plain;
}
