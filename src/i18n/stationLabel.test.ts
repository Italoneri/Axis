import { describe, expect, it } from 'vitest';
import { stationLabel } from './stationLabel';

describe('stationLabel', () => {
  it.each([
    { stationId: 'alambique-1', label: 'Alambique 1' },
    { stationId: 'alambique-4', label: 'Alambique 4' },
    { stationId: 'caldeirao-2', label: 'Caldeirão 2' },
    { stationId: 'circulo-1', label: 'Círculo de transmutação 1' },
    { stationId: 'forja-1', label: 'forja-1' },
  ])('labels $stationId as $label', ({ stationId, label }) => {
    expect(stationLabel(stationId)).toBe(label);
  });
});
