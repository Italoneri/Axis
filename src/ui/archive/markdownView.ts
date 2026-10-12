import { el } from '../dom';
import { parseDiscordMarkdown, type Block, type Inline } from './discordMarkdown';

const SPAN_TAGS = { strong: 'strong', em: 'em', underline: 'u', strike: 's' } as const;
/** Inside the archive window the page already has h2/h3: note headings start below them. */
const HEADING_TAGS = { 1: 'h4', 2: 'h5', 3: 'h6' } as const;

/** A note's text as elements; every piece of text goes through text nodes. */
export function renderMarkdown(text: string): HTMLElement {
  return el('div', { class: 'markdown' }, ...parseDiscordMarkdown(text).map(blockNode));
}

function blockNode(block: Block): HTMLElement {
  switch (block.type) {
    case 'heading':
      return el(HEADING_TAGS[block.level], {}, ...inlineNodes(block.children));
    case 'paragraph':
      return el(
        'p',
        {},
        ...block.lines.flatMap((line, index) => [
          index > 0 ? el('br') : null,
          ...inlineNodes(line),
        ]),
      );
    case 'quote':
      return el('blockquote', {}, ...block.blocks.map(blockNode));
    case 'list':
      return el(
        block.ordered ? 'ol' : 'ul',
        {},
        ...block.items.map((item) => el('li', {}, ...inlineNodes(item))),
      );
    case 'rule':
      return el('hr');
    default:
      return assertNever(block);
  }
}

function inlineNodes(nodes: readonly Inline[]): (Node | string)[] {
  return nodes.map((node) =>
    node.type === 'text' ? node.text : el(SPAN_TAGS[node.type], {}, ...inlineNodes(node.children)),
  );
}

function assertNever(value: never): never {
  throw new Error(`unknown markdown block: ${JSON.stringify(value)}`);
}
