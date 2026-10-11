import type { CommandContext, GameCommand } from '../commands/schema';
import type { MasterSession } from './MasterSession';

/**
 * Character acting on this device. Until phase 3 adds logins, the player picks
 * it by pressing "Depositar no Acampamento" on that character's card; with
 * logins, this becomes the signed-in user's character and ignores the choice.
 */
export function actingCharacter(command: GameCommand): string | undefined {
  return command.type === 'deposit' ? command.characterId : undefined;
}

/** Who runs a command from this device: the only place the UI decides the actor. */
export function commandContext(session: MasterSession, command: GameCommand): CommandContext {
  if (session.isActive) return { actor: { role: 'master' } };
  return { actor: { role: 'player', characterId: actingCharacter(command) } };
}
