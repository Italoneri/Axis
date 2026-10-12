import type { Character, GameState } from '../model/schema';
import { idError, nameError } from './Categories';
import { isEmptyBag } from './Coins';
import { fail, ok, withLog, type Outcome } from './outcome';

// The party. Each character owns a wallet; phase 3 will tie logins to these ids.

export interface CharacterFields {
  name: string;
  color: string;
  portrait?: string | undefined;
}

export function addCharacter(state: GameState, fields: CharacterFields & { id: string }): Outcome {
  return createCharacter(state, fields, 'character_added');
}

/** Online: a player creating their own character when they join (see the `join_game` action). */
export function joinWithNewCharacter(
  state: GameState,
  fields: CharacterFields & { id: string },
): Outcome {
  return createCharacter(state, fields, 'character_joined');
}

/**
 * Who plays a character lives outside the game (the players table); taking or
 * losing a player only writes it to the log, so the whole table sees it.
 */
export function logPlayerChange(
  state: GameState,
  id: string,
  kind: 'character_claimed' | 'character_released',
): Outcome {
  const character = state.characters.find((c) => c.id === id);
  if (!character) return fail('not_found');
  return ok(withLog(state, { day: state.day, kind, name: character.name }));
}

function createCharacter(
  state: GameState,
  fields: CharacterFields & { id: string },
  kind: 'character_added' | 'character_joined',
): Outcome {
  const error = idError(fields.id, state.characters) ?? nameError(fields.name, state.characters);
  if (error) return fail(error);
  const character: Character = { ...cleanFields(fields), id: fields.id };
  return ok(
    withLog(
      {
        ...state,
        characters: [...state.characters, character],
        wallets: {
          ...state.wallets,
          characters: { ...state.wallets.characters, [character.id]: {} },
        },
      },
      { day: state.day, kind, name: character.name },
    ),
  );
}

export function updateCharacter(state: GameState, id: string, fields: CharacterFields): Outcome {
  if (!state.characters.some((c) => c.id === id)) return fail('not_found');
  const error = nameError(fields.name, state.characters, id);
  if (error) return fail(error);
  const characters = state.characters.map((c) =>
    c.id === id ? { ...cleanFields(fields), id } : c,
  );
  return ok({ ...state, characters });
}

/** Refuses while the character still holds coins, so money never vanishes by accident. */
export function removeCharacter(state: GameState, id: string): Outcome {
  const character = state.characters.find((c) => c.id === id);
  if (!character) return fail('not_found');
  if (!isEmptyBag(state.wallets.characters[id] ?? {})) return fail('character_has_coins');
  const wallets = Object.fromEntries(
    Object.entries(state.wallets.characters).filter(([characterId]) => characterId !== id),
  );
  return ok(
    withLog(
      {
        ...state,
        characters: state.characters.filter((c) => c.id !== id),
        wallets: { ...state.wallets, characters: wallets },
      },
      { day: state.day, kind: 'character_removed', name: character.name },
    ),
  );
}

function cleanFields(fields: CharacterFields): Omit<Character, 'id'> {
  const portrait = fields.portrait?.trim();
  return { name: fields.name.trim(), color: fields.color, ...(portrait ? { portrait } : {}) };
}
