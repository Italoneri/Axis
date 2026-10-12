import type { CommandOutcome } from '../commands/applyCommand';
import type { CommandContext } from '../commands/schema';
import type { Catalog } from '../model/catalog';
import type { GameDb, MemberGame } from './gameDb';

// What every action of the game function shares: its dependencies, the caller
// and the replies.

export interface AuthPort {
  /** The user id of a valid access token; null when the token is invalid or expired. */
  userFromToken(token: string): Promise<string | null>;
}

/** Short-lived URLs for files of the private game-images bucket (service role). */
export interface PhotoSigner {
  /** Path → URL; paths that cannot be signed are left out. */
  signPhotos(paths: readonly string[]): Promise<Record<string, string>>;
}

export interface HandlerDeps {
  auth: AuthPort;
  db: GameDb;
  catalog: Catalog;
  photos: PhotoSigner;
}

export interface Caller extends HandlerDeps {
  userId: string;
}

export interface GameResponse {
  status: number;
  body: Readonly<Record<string, unknown>>;
}

export function reply(status: number, body: Record<string, unknown>): GameResponse {
  return { status, body };
}

export function conflict(revision?: number): GameResponse {
  return reply(409, { error: 'conflict', revision });
}

export function refusal(outcome: Extract<CommandOutcome, { ok: false }>): GameResponse {
  const status = outcome.error === 'forbidden' ? 403 : 422;
  return reply(status, { error: 'refused', reason: outcome.error, reasons: outcome.reasons });
}

/** The game when the caller is its master; otherwise the 403 to send back. */
export async function loadAsMaster(
  gameId: string,
  { userId, db }: Caller,
): Promise<MemberGame | GameResponse> {
  const game = await db.loadForMember(gameId, userId);
  if (!game) return reply(403, { error: 'not_member' });
  if (game.role !== 'master') return reply(403, { error: 'refused', reason: 'forbidden' });
  return game;
}

export function isGame(value: MemberGame | GameResponse): value is MemberGame {
  return 'role' in value;
}

/** The server's idea of who is acting: from the players table, never from the request. */
export function contextOf(game: MemberGame): CommandContext {
  if (game.role === 'master') return { actor: { role: 'master' } };
  return { actor: { role: 'player', characterId: game.characterId ?? undefined } };
}

/** 256 random bits, URL-safe: the secret part of an invite or entry link. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
