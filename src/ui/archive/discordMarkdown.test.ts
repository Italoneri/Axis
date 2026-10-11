import { describe, expect, it } from 'vitest';
import { parseDiscordMarkdown, parseInline, type Inline } from './discordMarkdown';

const text = (value: string): Inline => ({ type: 'text', text: value });

describe('parseInline', () => {
  it.each([
    { input: '**bold**', expected: [{ type: 'strong', children: [text('bold')] }] },
    { input: '*it*', expected: [{ type: 'em', children: [text('it')] }] },
    { input: '_it_', expected: [{ type: 'em', children: [text('it')] }] },
    { input: '__under__', expected: [{ type: 'underline', children: [text('under')] }] },
    { input: '~~gone~~', expected: [{ type: 'strike', children: [text('gone')] }] },
    {
      input: 'a **b** c',
      expected: [text('a '), { type: 'strong', children: [text('b')] }, text(' c')],
    },
    {
      input: '***both***',
      expected: [{ type: 'strong', children: [{ type: 'em', children: [text('both')] }] }],
    },
    {
      input: '__**x**__',
      expected: [{ type: 'underline', children: [{ type: 'strong', children: [text('x')] }] }],
    },
  ])('marks $input', ({ input, expected }) => {
    expect(parseInline(input)).toEqual(expected);
  });

  it.each([
    'snake_case_name',
    '2 * 3 * 4',
    '**unclosed',
    '* not italic*',
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
  ])('keeps %s literal', (input) => {
    expect(parseInline(input)).toEqual([text(input)]);
  });

  it('unescapes backslashed marks', () => {
    expect(parseInline('\\*not\\*')).toEqual([text('*not*')]);
  });
});

describe('parseDiscordMarkdown', () => {
  it('reads headings, rules and paragraphs with line breaks', () => {
    expect(parseDiscordMarkdown('# Título\nlinha 1\nlinha 2\n\n---\n### Fim')).toEqual([
      { type: 'heading', level: 1, children: [text('Título')] },
      { type: 'paragraph', lines: [[text('linha 1')], [text('linha 2')]] },
      { type: 'rule' },
      { type: 'heading', level: 3, children: [text('Fim')] },
    ]);
  });

  it('groups list items by kind', () => {
    expect(parseDiscordMarkdown('- a\n* b\n1. c\n2. d')).toEqual([
      { type: 'list', ordered: false, items: [[text('a')], [text('b')]] },
      { type: 'list', ordered: true, items: [[text('c')], [text('d')]] },
    ]);
  });

  it('quotes single lines and everything after >>>', () => {
    expect(parseDiscordMarkdown('> um\n> dois\nfora')).toEqual([
      {
        type: 'quote',
        blocks: [{ type: 'paragraph', lines: [[text('um')], [text('dois')]] }],
      },
      { type: 'paragraph', lines: [[text('fora')]] },
    ]);
    expect(parseDiscordMarkdown('antes\n>>> tudo\n- isto também')).toEqual([
      { type: 'paragraph', lines: [[text('antes')]] },
      {
        type: 'quote',
        blocks: [
          { type: 'paragraph', lines: [[text('tudo')]] },
          { type: 'list', ordered: false, items: [[text('isto também')]] },
        ],
      },
    ]);
  });

  it('keeps markup-looking text as plain text', () => {
    expect(parseDiscordMarkdown('<b>oi</b>\n#sem espaço')).toEqual([
      { type: 'paragraph', lines: [[text('<b>oi</b>')], [text('#sem espaço')]] },
    ]);
  });
});
