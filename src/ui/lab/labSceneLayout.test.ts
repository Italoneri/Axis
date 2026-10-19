import { describe, expect, it } from 'vitest';
import type { Brew, StationDef } from '../../model/schema';
import { brewStage, liquidColor, stationSignature } from './labSceneLayout';
import type { StationView } from './labViews';

const station: StationDef = { id: 'alambique-1', type: 'alambique', x: 0, y: 0, w: 0.1, h: 0.1 };
const brew: Brew = {
  recipeId: 'r',
  outputId: 'cura',
  outputQty: 2,
  days: 4,
  spent: [],
  progressTenths: 0,
};
const brewing = (progress: number): StationView => ({
  kind: 'brewing',
  station,
  brew,
  potionName: 'Cura',
  daysLeft: 2,
  progress,
});

describe('liquidColor', () => {
  it('usesTheMastersColor', () => {
    expect(liquidColor({ outputId: 'cura', color: '#ff0000' })).toBe('#ff0000');
  });

  it('drawsAStableHueFromTheOutputId', () => {
    const color = liquidColor({ outputId: 'cura' });
    expect(color).toMatch(/^hsl\(\d{1,3} 70% 55%\)$/);
    expect(liquidColor({ outputId: 'cura' })).toBe(color);
    expect(liquidColor({ outputId: 'mana' })).not.toBe(color);
  });
});

describe('brewStage', () => {
  it.each([
    { view: { kind: 'free', station } as const, stage: 'idle' },
    { view: brewing(0), stage: 'simmer' },
    { view: brewing(0.49), stage: 'simmer' },
    { view: brewing(0.5), stage: 'boil' },
    { view: { kind: 'ready', station, brew, potionName: 'Cura' } as const, stage: 'ready' },
  ])('$stage', ({ view, stage }) => {
    expect(brewStage(view)).toBe(stage);
  });
});

describe('stationSignature', () => {
  it('changesWhenTheDrawingChanges', () => {
    expect(stationSignature(brewing(0.25))).not.toBe(stationSignature(brewing(0.5)));
    expect(stationSignature(brewing(0.25))).toBe(stationSignature(brewing(0.25)));
    expect(stationSignature({ kind: 'free', station })).toBe('free');
  });
});
