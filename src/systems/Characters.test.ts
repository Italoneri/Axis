import { describe, expect, it } from 'vitest';
import { addCharacter, removeCharacter, updateCharacter } from './Characters';
import { makeState } from './testFixtures';

describe('characters', () => {
  it('adds a character with an empty wallet', () => {
    const result = addCharacter(makeState(), {
      id: 'char_1',
      name: 'Lyra',
      color: '#6a8fd4',
      portrait: '',
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.characters.at(-1)).toEqual({
      id: 'char_1',
      name: 'Lyra',
      color: '#6a8fd4',
    });
    expect(result.state.wallets.characters['char_1']).toEqual({});
    expect(result.state.log.at(-1)).toMatchObject({ kind: 'character_added', name: 'Lyra' });
  });

  it('renames without touching the wallet', () => {
    const result = updateCharacter(makeState(), 'thorin', { name: 'Thorin II', color: '#000000' });
    expect(result.ok && result.state.characters[0]?.name).toBe('Thorin II');
    expect(result.ok && result.state.wallets.characters['thorin']).toEqual({ gold: 5 });
  });

  it('only removes characters whose wallet is empty', () => {
    expect(removeCharacter(makeState(), 'thorin')).toEqual({
      ok: false,
      error: 'character_has_coins',
    });
    const empty = makeState({ wallets: { camp: {}, characters: { thorin: {} } } });
    const result = removeCharacter(empty, 'thorin');
    expect(result.ok && result.state).toMatchObject({
      characters: [],
      wallets: { characters: {} },
    });
  });
});
