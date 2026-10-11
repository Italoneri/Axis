import { describe, expect, it } from 'vitest';
import { testCatalog } from '../systems/testFixtures';
import { formatGold, formatWage } from './format';

describe('formatGold', () => {
  it.each([
    { bronze: 0, text: '0 PO' },
    { bronze: 5, text: '0,05 PO' },
    { bronze: 55450, text: '554,5 PO' },
    // 111.111 emeralds given by the master: correct math, not a display bug.
    { bronze: 1_111_102_450, text: '11.111.024,5 PO' },
  ])('shows $bronze bronze as "$text"', ({ bronze, text }) => {
    expect(formatGold(testCatalog, bronze)).toBe(text);
  });
});

describe('formatWage', () => {
  it.each([
    { wage: undefined, text: 'Sem salário' },
    { wage: 0, text: 'Sem salário' },
    { wage: 0.04, text: 'Salário: 4 Bronze/dia' },
    { wage: 0.12, text: 'Salário: 1 Prata e 2 Bronze/dia' },
    { wage: 1.5, text: 'Salário: 1 Ouro e 5 Prata/dia' },
  ])('shows a wage of $wage PO as "$text"', ({ wage, text }) => {
    expect(formatWage(testCatalog, wage)).toBe(text);
  });
});
