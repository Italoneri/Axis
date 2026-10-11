/**
 * Id for a record created in game: a short kind prefix plus 64 random bits,
 * so two players creating "Ferro" at the same time never collide. Uses
 * `getRandomValues` because `randomUUID` is missing outside secure contexts
 * (the game opened over plain http on the local network).
 */
export function newId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}
