import { describe, expect, it } from 'vitest';
import { incompleteCreditRows, uncreditedLayers, type ExportedCharacter } from './credits';

const credit = (file: string, authors = ['Sharm'], licenses = ['CC-BY-SA 3.0']) => ({
  file,
  authors,
  licenses,
});
const layer = (spritePath: string) => ({
  itemId: 'item',
  source: { kind: 'catalog', spritePath },
});

describe('uncreditedLayers', () => {
  it('accepts layers under a credited folder', () => {
    const character: ExportedCharacter = {
      layers: [layer('hair/princess/adult/fg/walk.png'), layer('head/faces/elderly/idle.png')],
      credits: [credit('hair/princess'), credit('head/faces')],
    };
    expect(uncreditedLayers(character)).toEqual([]);
  });

  it.each([
    { case: 'no credit', credits: [credit('hair/other')] },
    { case: 'a credit without authors', credits: [credit('hair/princess', [])] },
    { case: 'a credit without licenses', credits: [credit('hair/princess', ['Sharm'], [])] },
    { case: 'a credit for a sibling folder', credits: [credit('hair/prince')] },
  ])('reports a layer with $case', ({ credits }) => {
    const character = { layers: [layer('hair/princess/adult/fg/walk.png')], credits };
    expect(uncreditedLayers(character)).toEqual(['hair/princess/adult/fg/walk.png']);
  });
});

describe('incompleteCreditRows', () => {
  it('lists rows missing authors or licenses', () => {
    const csv = [
      'filename,notes,authors,licenses,urls',
      '"a/walk.png","","Sharm","OGA-BY 3.0",""',
      '"b/walk.png","","","OGA-BY 3.0",""',
      '"c/walk.png","","Sharm, wulax","",""',
    ].join('\n');
    expect(incompleteCreditRows(csv)).toEqual(['b/walk.png', 'c/walk.png']);
  });
});
