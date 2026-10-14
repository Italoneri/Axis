import { describe, expect, it } from 'vitest';
import { GLOVES_FIX as gloves, fixDefinition } from './definitionFixes';

describe('fixDefinition', () => {
  it('swaps the recolors when upstream still has the broken value', () => {
    const { outcome, definition } = fixDefinition(
      { name: 'Gloves', recolors: gloves.from },
      gloves,
    );
    expect(outcome).toBe('applied');
    expect(definition).toEqual({ name: 'Gloves', recolors: gloves.to });
  });

  it('leaves an already fixed definition alone', () => {
    expect(fixDefinition({ recolors: gloves.to }, gloves).outcome).toBe('already');
  });

  it('leaves a definition upstream changed alone', () => {
    const changed = { recolors: { material: 'cloth', palettes: ['ulpc'] } };
    expect(fixDefinition(changed, gloves)).toEqual({
      outcome: 'upstream-changed',
      definition: changed,
    });
  });
});
