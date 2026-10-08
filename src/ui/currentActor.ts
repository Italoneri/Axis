/**
 * Character acting on this device. Until phase 3 adds logins, the player picks
 * it by pressing "Depositar no Acampamento" on that character's card; with
 * logins, this becomes the signed-in user's character and ignores the choice.
 */
export function actingCharacter(chosenCharacterId: string): string {
  return chosenCharacterId;
}
