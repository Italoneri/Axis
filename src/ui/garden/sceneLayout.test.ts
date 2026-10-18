import { describe, expect, it } from 'vitest';
import { gameData } from '../../data/gameData';
import type { Crop, PlotDef } from '../../model/schema';
import {
  cropLook,
  gardenScenery,
  plantSpots,
  plantStage,
  plantTufts,
  plotSignature,
  popoverPosition,
} from './sceneLayout';
import type { PlotView } from './gardenViews';

const plot: PlotDef = { id: 'canteiro-1', type: 'canteiro', x: 0.4, y: 0.4, w: 0.1, h: 0.1 };
const crop: Crop = {
  seedId: 'hortela',
  harvestId: 'erva',
  plotType: 'canteiro',
  days: 3,
  yield: 2,
  rare: false,
  price: { bronze: 2 },
};

const growing = (progress: number): PlotView => ({
  kind: 'growing',
  plot,
  crop,
  harvestName: 'Hortelã',
  daysLeft: 1,
  progress,
});

describe('cropLook', () => {
  it('givesTheSameLookToTheSameSeed', () => {
    expect(cropLook('hortela')).toEqual(cropLook('hortela'));
  });

  it('keepsTheHueInsideAFullTurn', () => {
    const hues = ['a', 'hortela', 'lavanda', 'semente-de-lotus'].map((id) => cropLook(id).hue);
    hues.forEach((hue) => expect(hue).toBeGreaterThanOrEqual(-180));
    hues.forEach((hue) => expect(hue).toBeLessThan(180));
  });

  it('variesBetweenSeeds', () => {
    const looks = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) =>
      JSON.stringify(cropLook(id)),
    );
    expect(new Set(looks).size).toBeGreaterThan(1);
    expect(new Set(looks.map((look) => look.includes('flower'))).size).toBe(2);
  });
});

describe('plantStage', () => {
  it.each([
    { progress: 0, stage: 'seeded' },
    { progress: 0.1, stage: 'sprout' },
    { progress: 0.33, stage: 'sprout' },
    { progress: 0.34, stage: 'young' },
    { progress: 0.66, stage: 'young' },
    { progress: 0.67, stage: 'grown' },
    { progress: 0.99, stage: 'grown' },
  ] as const)('growsTo $stage at $progress', ({ progress, stage }) => {
    expect(plantStage(growing(progress))).toBe(stage);
  });

  it('marksReadyAndEmptyPlots', () => {
    expect(plantStage({ kind: 'ready', plot, crop, harvestName: 'Hortelã' })).toBe('ready');
    expect(plantStage({ kind: 'empty', plot })).toBeUndefined();
  });
});

describe('plantTufts', () => {
  it.each([
    { type: 'canteiro', count: 8 },
    { type: 'muda', count: 1 },
    { type: 'estufa', count: 2 },
    { type: 'arcana', count: 1 },
    { type: 'lago', count: 3 },
  ] as const)('places $count tufts in a $type', ({ type, count }) => {
    expect(plantSpots(type)).toHaveLength(count);
    expect(plantTufts(type, 'young', cropLook('x'))).toHaveLength(count);
  });

  it('showsMoundsRightAfterPlanting', () => {
    const tufts = plantTufts('estufa', 'seeded', cropLook('x'));
    expect(tufts.map((tuft) => tuft.kind)).toEqual(['mound', 'mound']);
  });

  it.each([
    { stage: 'sprout', kind: 'flower', sprite: /^leaf[345]$/, tone: 'plain' },
    { stage: 'young', kind: 'flower', sprite: /^leaf[012]$/, tone: 'plain' },
    { stage: 'grown', kind: 'flower', sprite: /^flower[2-5]$/, tone: 'bud' },
    { stage: 'grown', kind: 'foliage', sprite: /^leaf[012]$/, tone: 'plain' },
    { stage: 'ready', kind: 'flower', sprite: /^flower[2-5]$/, tone: 'bloom' },
    { stage: 'ready', kind: 'foliage', sprite: /^leaf[012]$/, tone: 'lush' },
  ] as const)('drawsA $kind at $stage with $tone sprites', ({ stage, kind, sprite, tone }) => {
    const tufts = plantTufts('canteiro', stage, { kind, hue: 0 });
    tufts.forEach((tuft) => {
      if (tuft.kind !== 'plant') throw new Error('expected a plant');
      expect(tuft.sprite).toMatch(sprite);
      expect(tuft.tone).toBe(tone);
    });
  });
});

describe('plotSignature', () => {
  it('changesOnlyWhenTheDrawingChanges', () => {
    expect(plotSignature(growing(0.5))).toBe(plotSignature(growing(0.5)));
    expect(plotSignature(growing(0.5))).not.toBe(plotSignature(growing(0.6)));
    expect(plotSignature({ kind: 'empty', plot })).not.toBe(plotSignature(growing(0)));
  });
});

describe('popoverPosition', () => {
  const scene = { width: 1000, height: 600 };
  const popover = { width: 200, height: 100 };

  it('opensCenteredAboveThePlot', () => {
    expect(popoverPosition(plot, scene, popover)).toEqual({ left: 350, top: 126 });
  });

  it('opensBelowWhenThereIsNoRoomAbove', () => {
    const top = { ...plot, y: 0.05 };
    expect(popoverPosition(top, scene, popover).top).toBe((0.05 + 0.1) * 600 + 18);
  });

  it('staysInsideTheScene', () => {
    const corner = { ...plot, x: 0.95, y: 0.05, w: 0.05, h: 0.9 };
    expect(popoverPosition(corner, scene, popover)).toEqual({ left: 792, top: 492 });
  });
});

describe('gardenScenery', () => {
  const levels = gameData.garden.levels.map((level) => level.plots);
  const summary = (level: number) =>
    gardenScenery(levels, level).map((piece) =>
      piece.kind === 'bench' ? `bench:${piece.style}` : `locked:${piece.area}:${piece.level}`,
    );

  it('outlinesWhatLevelTwoAndThreeAdd', () => {
    expect(summary(1)).toEqual([
      'locked:greenhouse:2',
      'locked:plot:2',
      'locked:ponds:3',
      ...Array<string>(3).fill('locked:plot:2'),
      ...Array<string>(3).fill('locked:plot:3'),
    ]);
  });

  it('drawsTwoGreenhouseBenchesAtLevelTwo', () => {
    expect(summary(2)).toEqual([
      'bench:estufa',
      'bench:estufa',
      'locked:ponds:3',
      ...Array<string>(3).fill('locked:plot:3'),
    ]);
  });

  it('turnsTheRightBenchArcaneAtLevelThree', () => {
    expect(summary(3)).toEqual(['bench:estufa', 'bench:arcana']);
  });

  it('drawsNothingButOutlinesBeforeTheGardenIsBuilt', () => {
    expect(summary(0).every((piece) => piece.startsWith('locked'))).toBe(true);
  });
});
