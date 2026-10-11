import { describe, expect, it } from 'vitest';
import { BODY_LIMIT, TITLE_LIMIT } from './Archive';
import { splitPastedRecords } from './ArchivePaste';

describe('splitPastedRecords', () => {
  it('splits at lines of five or more dashes and titles each record', () => {
    const pasted = [
      '**Requisição de Selos**',
      'Pedido de 30 selos.',
      '',
      '-----',
      '',
      '# Zolt-Raak',
      'Meio-orc ferreiro.',
      '----------',
      'Só título',
    ].join('\r\n');
    expect(splitPastedRecords(pasted)).toEqual([
      { title: 'Requisição de Selos', body: 'Pedido de 30 selos.', isTooLong: false },
      { title: 'Zolt-Raak', body: 'Meio-orc ferreiro.', isTooLong: false },
      { title: 'Só título', body: '', isTooLong: false },
    ]);
  });

  it.each([
    { name: 'short dash lines stay in the text', input: 'A\n----\nB', count: 1 },
    { name: 'empty chunks are skipped', input: '-----\n\n-----\nA\n-----', count: 1 },
    { name: 'nothing pasted', input: '   ', count: 0 },
  ])('$name', ({ input, count }) => {
    expect(splitPastedRecords(input)).toHaveLength(count);
  });

  it('cuts long titles and flags long texts', () => {
    const [record] = splitPastedRecords(`${'t'.repeat(300)}\n${'b'.repeat(BODY_LIMIT + 1)}`);
    expect(record?.title).toHaveLength(TITLE_LIMIT);
    expect(record?.isTooLong).toBe(true);
  });

  it('names a record whose first line is only marks', () => {
    expect(splitPastedRecords('****\ntexto')[0]?.title).toBe('Registro sem título');
  });
});
