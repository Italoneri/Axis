import { describe, expect, it } from 'vitest';
import { plotLabel } from './plotLabel';

describe('plotLabel', () => {
  it.each([
    { plotId: 'canteiro-1', label: 'Canteiro 1' },
    { plotId: 'canteiro-6', label: 'Canteiro 6' },
    { plotId: 'muda-3', label: 'Muda 3' },
    { plotId: 'estufa-2', label: 'Bancada 2' },
    { plotId: 'arcana-1', label: 'Bancada arcana' },
    { plotId: 'lago-1', label: 'Lago' },
    { plotId: 'glicinia-1', label: 'glicinia-1' },
  ])('labels $plotId as $label', ({ plotId, label }) => {
    expect(plotLabel(plotId)).toBe(label);
  });
});
