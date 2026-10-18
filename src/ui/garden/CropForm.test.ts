import { describe, expect, it } from 'vitest';
import { cropFormValues, type CropDraft } from './CropForm';

const draft: CropDraft = {
  seedId: 'seed',
  harvestId: 'herb',
  plotType: 'canteiro',
  days: 3,
  yield: 2,
  rare: false,
  price: { bronze: 5 },
};

describe('cropFormValues', () => {
  it.each([
    ['noSeed', { seedId: '' }, 'missing_material'],
    ['noHarvest', { harvestId: '' }, 'missing_material'],
    ['commonWithEmptyPrice', { price: {} }, 'empty_price'],
    ['commonWithZeroPrice', { price: { bronze: 0 } }, 'empty_price'],
  ] as const)('refuses %s', (_name, change, reason) => {
    expect(cropFormValues({ ...draft, ...change })).toEqual({ ok: false, reason });
  });

  it('buildsCommonCropWithPrice', () => {
    expect(cropFormValues(draft)).toEqual({
      ok: true,
      crop: {
        seedId: 'seed',
        harvestId: 'herb',
        plotType: 'canteiro',
        days: 3,
        yield: 2,
        rare: false,
        price: { bronze: 5 },
      },
    });
  });

  it('ignoresPriceOfRareCrop', () => {
    const result = cropFormValues({ ...draft, rare: true, price: {} });
    expect(result).toEqual({
      ok: true,
      crop: {
        seedId: 'seed',
        harvestId: 'herb',
        plotType: 'canteiro',
        days: 3,
        yield: 2,
        rare: true,
      },
    });
  });
});
