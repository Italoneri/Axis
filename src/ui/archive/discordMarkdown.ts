// Discord's markdown, as the records arrive pasted from there. Parsed into a
// small tree (pure, tested) that `renderMarkdown` turns into elements without
// innerHTML: anything not recognized stays literal text.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'underline' | 'strike'; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  /** Lines kept apart by line breaks. */
  | { type: 'paragraph'; lines: Inline[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'rule' };

type Span = Exclude<Inline['type'], 'text'>;

/** Longer marks first, so `**` is never read as two `*`. */
const DELIMITERS: readonly { mark: string; type: Span }[] = [
  { mark: '**', type: 'strong' },
  { mark: '__', type: 'underline' },
  { mark: '~~', type: 'strike' },
  { mark: '*', type: 'em' },
  { mark: '_', type: 'em' },
];

const HEADING = /^(#{1,3}) +(.*)$/;
const HEADING_LEVELS = [1, 2, 3] as const;
/** `\*` shows a literal star, as on Discord. */
const ESCAPABLE = new Set(['\\', '*', '_', '~', '>', '#', '-', '`']);
const QUOTE = /^> ?(.*)$/;
const QUOTE_REST = /^>>> ?(.*)$/;
const BULLET = /^\s*[-*] +(.*)$/;
const NUMBERED = /^\s*\d{1,3}\. +(.*)$/;
const RULE = /^\s*-{3,}\s*$/;

export function parseDiscordMarkdown(text: string): Block[] {
  return parseBlocks(text.replace(/\r\n?/g, '\n').split('\n'));
}

function parseBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const consumed = readBlock(lines, index);
    if (consumed.block) blocks.push(consumed.block);
    index = consumed.next;
  }
  return blocks;
}

/** One block starting at `start`; blank lines produce no block. */
function readBlock(lines: readonly string[], start: number): { block?: Block; next: number } {
  const line = lines[start] ?? '';
  const rest = QUOTE_REST.exec(line);
  if (rest) {
    const quoted = [rest[1] ?? '', ...lines.slice(start + 1)];
    return { block: { type: 'quote', blocks: parseBlocks(quoted) }, next: lines.length };
  }
  if (QUOTE.test(line)) {
    const end = runEnd(lines, start, (l) => QUOTE.test(l) && !QUOTE_REST.test(l));
    const quoted = lines.slice(start, end).map((l) => QUOTE.exec(l)?.[1] ?? '');
    return { block: { type: 'quote', blocks: parseBlocks(quoted) }, next: end };
  }
  const heading = HEADING.exec(line);
  if (heading) {
    const level = HEADING_LEVELS[(heading[1]?.length ?? 1) - 1] ?? 3;
    return {
      block: { type: 'heading', level, children: parseInline(heading[2] ?? '') },
      next: start + 1,
    };
  }
  if (RULE.test(line)) return { block: { type: 'rule' }, next: start + 1 };
  for (const [pattern, ordered] of [
    [BULLET, false],
    [NUMBERED, true],
  ] as const) {
    if (!pattern.test(line)) continue;
    const end = runEnd(lines, start, (l) => pattern.test(l));
    const items = lines.slice(start, end).map((l) => parseInline(pattern.exec(l)?.[1] ?? ''));
    return { block: { type: 'list', ordered, items }, next: end };
  }
  if (line.trim() === '') return { next: start + 1 };
  const end = runEnd(lines, start, (l) => l.trim() !== '' && !startsBlock(l));
  const paragraph = lines.slice(start, end).map(parseInline);
  return { block: { type: 'paragraph', lines: paragraph }, next: end };
}

function startsBlock(line: string): boolean {
  return [QUOTE, HEADING, RULE, BULLET, NUMBERED].some((pattern) => pattern.test(line));
}

/** Index after the run of lines (from `start`, which always belongs) matching `belongs`. */
function runEnd(
  lines: readonly string[],
  start: number,
  belongs: (line: string) => boolean,
): number {
  let end = start + 1;
  while (end < lines.length && belongs(lines[end] ?? '')) end++;
  return end;
}

export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let literal = '';
  let index = 0;
  while (index < text.length) {
    const next = text[index + 1];
    if (text[index] === '\\' && next !== undefined && ESCAPABLE.has(next)) {
      literal += next;
      index += 2;
      continue;
    }
    const span = readSpan(text, index);
    if (span) {
      if (literal) nodes.push({ type: 'text', text: literal });
      literal = '';
      nodes.push(span.node);
      index = span.next;
    } else {
      literal += text[index];
      index++;
    }
  }
  if (literal) nodes.push({ type: 'text', text: literal });
  return nodes;
}

/** A marked span opening at `start`, if its closing mark exists. */
function readSpan(text: string, start: number): { node: Inline; next: number } | null {
  for (const { mark, type } of DELIMITERS) {
    if (!text.startsWith(mark, start) || !canOpen(text, start, mark)) continue;
    const close = closingIndex(text, start + mark.length, mark);
    if (close < 0) continue;
    const inner = text.slice(start + mark.length, close);
    return { node: { type, children: parseInline(inner) }, next: close + mark.length };
  }
  return null;
}

function canOpen(text: string, start: number, mark: string): boolean {
  const after = text[start + mark.length];
  if (after === undefined || /\s/.test(after)) return false;
  // `_` only marks whole words, as on Discord: snake_case_names stay literal.
  return mark !== '_' || !isWordChar(text[start - 1]);
}

function closingIndex(text: string, from: number, mark: string): number {
  let close = text.indexOf(mark, from + 1);
  while (close >= 0) {
    // `***both***`: the bold closes on the last two stars.
    while (text.startsWith(mark[0] ?? '', close + mark.length) && mark.length > 1) close++;
    const before = text[close - 1];
    const isValid =
      before !== undefined && !/\s/.test(before) && (mark !== '_' || !isWordChar(text[close + 1]));
    if (isValid) return close;
    close = text.indexOf(mark, close + 1);
  }
  return -1;
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}
