import { describe, expect, it } from 'vitest';
import { BODY_LIMIT } from './Archive';
import { nextRecordNumber, numberedTitle, splitPastedRecords } from './ArchivePaste';

describe('splitPastedRecords', () => {
  it('keeps each whole block as the text, first line and marks included', () => {
    const pasted = [
      '',
      '**Requisição de Selos**',
      'Pedido de 30 selos.',
      '',
      '-----',
      '',
      '# Zolt-Raak',
      '  Meio-orc ferreiro.',
      '----------',
      'Só uma linha',
    ].join('\r\n');
    expect(splitPastedRecords(pasted)).toEqual([
      { body: '**Requisição de Selos**\nPedido de 30 selos.', isTooLong: false },
      { body: '# Zolt-Raak\n  Meio-orc ferreiro.', isTooLong: false },
      { body: 'Só uma linha', isTooLong: false },
    ]);
  });

  it.each([
    { name: 'short dash lines stay in the text', input: 'A\n----\nB', count: 1 },
    { name: 'blank blocks are skipped', input: '-----\n  \n-----\nA\n-----', count: 1 },
    { name: 'one block without separators', input: 'Título\ntexto', count: 1 },
    { name: 'nothing pasted', input: '   ', count: 0 },
  ])('$name', ({ input, count }) => {
    expect(splitPastedRecords(input)).toHaveLength(count);
  });

  it('flags texts over the limit', () => {
    const [short, long] = splitPastedRecords(`curto\n-----\n${'b'.repeat(BODY_LIMIT + 1)}`);
    expect(short?.isTooLong).toBe(false);
    expect(long?.isTooLong).toBe(true);
  });
});

describe('numberedTitle', () => {
  it.each([
    { prefix: 'Registro', number: 1, title: 'Registro 1' },
    { prefix: ' Carta ', number: 12, title: 'Carta 12' },
    { prefix: '', number: 3, title: '3' },
    { prefix: '  ', number: 4, title: '4' },
  ])('titles $number with "$prefix" as "$title"', ({ prefix, number, title }) => {
    expect(numberedTitle(prefix, number)).toBe(title);
  });

  it('numbers from N without skipping blank blocks', () => {
    const texts = splitPastedRecords('A\n-----\n\n-----\nB\n-----\nC');
    expect(texts.map((_, index) => numberedTitle('Registro', 5 + index))).toEqual([
      'Registro 5',
      'Registro 6',
      'Registro 7',
    ]);
  });

  it('keeps the number when the prefix is too long', () => {
    expect(numberedTitle('x'.repeat(300), 12)).toMatch(/^x+ 12$/);
  });
});

describe('nextRecordNumber', () => {
  // Titles of the topic's notes, trashed ones included.
  const titles = [
    'Registro 1',
    'Registro 4',
    ' Registro 2 ',
    'Carta 9',
    'Registro antigo',
    '7',
    'Registro 3x',
  ];

  it.each([
    { prefix: 'Registro', next: 5 },
    { prefix: 'Carta', next: 10 },
    { prefix: 'Diário', next: 1 },
    { prefix: '', next: 8 },
    { prefix: 'C.rta', next: 1 },
  ])('suggests $next for "$prefix"', ({ prefix, next }) => {
    expect(nextRecordNumber(titles, prefix)).toBe(next);
  });

  it('starts at 1 in an empty topic', () => {
    expect(nextRecordNumber([], 'Registro')).toBe(1);
  });
});
