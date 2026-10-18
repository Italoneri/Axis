import { describe, expect, it } from 'vitest';
import { chosenLook, cropFormValues, type CropDraft } from './CropForm';

const draft: CropDraft = {
  seedId: 'seed',
  harvestId: 'herb',
  plotType: 'canteiro',
  days: 3,
  yield: 2,
  rare: false,
  price: { bronze: 5 },
  look: undefined,
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

  it('keepsTheChosenLook', () => {
    const look = { kind: 'flower', hue: 80 } as const;
    const result = cropFormValues({ ...draft, look });
    expect(result.ok && result.crop.look).toEqual(look);
  });

  it('leavesAutomaticCropsWithoutLook', () => {
    const result = cropFormValues(draft);
    expect(result.ok && 'look' in result.crop).toBe(false);
  });
});

describe('chosenLook', () => {
  it.each([
    { mode: 'auto', look: undefined },
    { mode: 'flower', look: { kind: 'flower', hue: -40 } },
    { mode: 'foliage', look: { kind: 'foliage', hue: 0 } },
  ] as const)('turns $mode into its look', ({ mode, look }) => {
    expect(chosenLook(mode, -40)).toEqual(look);
  });
});
