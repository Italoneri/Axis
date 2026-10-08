import { describe, expect, it } from 'vitest';
import {
  applyResourceDelta,
  canAfford,
  missingResources,
  subtractResources,
} from './ResourceSystem';

describe('missingResources', () => {
  it.each([
    { name: 'nothing missing', have: { gold: 10 }, cost: { gold: 10 }, missing: {} },
    { name: 'partial shortfall', have: { gold: 4 }, cost: { gold: 10 }, missing: { gold: 6 } },
    { name: 'absent resource', have: {}, cost: { arcana: 3 }, missing: { arcana: 3 } },
    {
      name: 'mixed',
      have: { gold: 50, materials: 1 },
      cost: { gold: 20, materials: 5 },
      missing: { materials: 4 },
    },
    { name: 'empty cost', have: {}, cost: {}, missing: {} },
  ])('reports $name', ({ have, cost, missing }) => {
    expect(missingResources(have, cost)).toEqual(missing);
  });
});

describe('canAfford', () => {
  it('accepts exact amounts and rejects any shortfall', () => {
    expect(canAfford({ gold: 5, materials: 2 }, { gold: 5, materials: 2 })).toBe(true);
    expect(canAfford({ gold: 5 }, { gold: 5, materials: 1 })).toBe(false);
  });
});

describe('applyResourceDelta', () => {
  it.each([
    {
      name: 'adds and removes',
      have: { gold: 10, arcana: 5 },
      delta: { gold: 5, arcana: -2 },
      resources: { gold: 15, arcana: 3 },
      applied: { gold: 5, arcana: -2 },
    },
    {
      name: 'floors removals at zero',
      have: { gold: 3 },
      delta: { gold: -10 },
      resources: { gold: 0 },
      applied: { gold: -3 },
    },
    {
      name: 'adds a resource not held yet',
      have: {},
      delta: { influence: 2 },
      resources: { influence: 2 },
      applied: { influence: 2 },
    },
    {
      name: 'drops zero changes',
      have: { gold: 0 },
      delta: { gold: -1 },
      resources: { gold: 0 },
      applied: {},
    },
  ])('$name', ({ have, delta, resources, applied }) => {
    expect(applyResourceDelta(have, delta)).toEqual({ resources, applied });
  });
});

describe('subtractResources', () => {
  it('subtracts the cost and keeps untouched resources', () => {
    expect(subtractResources({ gold: 10, arcana: 2 }, { gold: 4 })).toEqual({
      gold: 6,
      arcana: 2,
    });
  });

  it('does not mutate the input', () => {
    const have = { gold: 10 };
    subtractResources(have, { gold: 3 });
    expect(have).toEqual({ gold: 10 });
  });
});
