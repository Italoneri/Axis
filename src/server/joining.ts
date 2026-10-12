import { z } from 'zod';
import { actorName, applyCommand, MASTER_ACTOR } from '../commands/applyCommand';
import { newId } from '../commands/newId';
import type { CommandContext, GameCommand } from '../commands/schema';
import type { Character, GameState } from '../model/schema';
import { imagePath } from '../persistence/ArchiveImageStore';
import { fileRef, parseUploadRef } from '../systems/GameImages';
import { parseState } from '../systems/SaveSystem';
import {
  conflict,
  isGame,
  loadAsMaster,
  randomToken,
  refusal,
  reply,
  sha256Hex,
  type Caller,
  type GameResponse,
} from './caller';
import type { JoinLinkRefusal, JoinPeek, JoinStatus } from './gameDb';

// The game's entry link: the master shares one reusable link, and whoever opens
// it takes a character nobody plays yet or creates their own. Who plays what
// lives in the players table; the log line goes through applyCommand, so the
// whole table sees it.

export const MAX_JOIN_LINK_DAYS = 90;
/** Joins computed on a state someone else changed meanwhile are tried again. */
const MAX_JOIN_ATTEMPTS = 3;

export const joinTokenSchema = z.string().min(16).max(128);

export const joinChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('claim'), characterId: z.string().min(1) }),
  z.object({
    kind: z.literal('create'),
    name: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    /** The Google photo as a start; uploads come later, once the player is in the game. */
    portrait: z
      .string()
      .max(2048)
      .regex(/^https:\/\//)
      .optional(),
  }),
]);
type JoinChoice = z.infer<typeof joinChoiceSchema>;

type OpenPeek = Extract<JoinPeek, { status: 'ok' }>;

export async function createJoinLink(
  { gameId, expiresInDays }: { gameId: string; expiresInDays?: number | undefined },
  caller: Caller,
): Promise<GameResponse> {
  const game = await loadAsMaster(gameId, caller);
  if (!isGame(game)) return game;
  const token = randomToken();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * DAY_MS) : null;
  const linkId = await caller.db.createJoinLink({
    gameId,
    tokenHash: await sha256Hex(token),
    createdBy: caller.userId,
    expiresAt,
  });
  // As with invites, the token exists in clear only here: the master shares it as a link.
  return reply(201, { linkId, token, expiresAt: expiresAt?.toISOString() ?? null });
}

export async function revokeJoinLink(
  { gameId, linkId }: { gameId: string; linkId: string },
  caller: Caller,
): Promise<GameResponse> {
  const game = await loadAsMaster(gameId, caller);
  if (!isGame(game)) return game;
  const revoked = await caller.db.revokeJoinLink(gameId, linkId);
  return revoked ? reply(200, { revoked: true }) : reply(404, { error: 'not_found' });
}

/** The "Entrar na Axis" screen: the game and the characters still without a player. */
export async function previewJoin(
  { token }: { token: string },
  caller: Caller,
): Promise<GameResponse> {
  const peek = await caller.db.peekJoin(await sha256Hex(token), caller.userId);
  if (peek.status !== 'ok') return linkRefused(peek.status);
  const state = storedState(peek, caller);
  const free = state.characters.filter((c) => !peek.taken.includes(c.id));
  const photos = await caller.photos.signPhotos(
    free.flatMap((c) => uploadThumbPath(peek.gameId, c) ?? []),
  );
  return reply(200, {
    gameId: peek.gameId,
    gameName: peek.gameName,
    isMember: peek.isMember,
    characters: free.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      portrait: shownPortrait(peek.gameId, c, photos),
    })),
  });
}

export async function joinGame(
  { token, choice }: { token: string; choice: JoinChoice },
  caller: Caller,
): Promise<GameResponse> {
  const tokenHash = await sha256Hex(token);
  for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt += 1) {
    const peek = await caller.db.peekJoin(tokenHash, caller.userId);
    if (peek.status !== 'ok') return linkRefused(peek.status);
    if (peek.isMember) return reply(409, { error: 'already_member', gameId: peek.gameId });
    const result = await tryJoin(peek, { tokenHash, choice }, caller);
    if (result !== 'conflict') return result;
  }
  return conflict();
}

async function tryJoin(
  peek: OpenPeek,
  { tokenHash, choice }: { tokenHash: string; choice: JoinChoice },
  caller: Caller,
): Promise<GameResponse | 'conflict'> {
  const state = storedState(peek, caller);
  const command = joinCommand(choice);
  const characterId = command.type === 'character_join' ? command.id : command.characterId;
  if (peek.taken.includes(characterId)) return reply(409, { error: 'character_taken' });

  const ctx: CommandContext = { actor: { role: 'player', characterId }, membership: true };
  const outcome = applyCommand(state, caller.catalog, command, ctx);
  if (!outcome.ok) return refusal(outcome);
  const status = await caller.db.joinGame({
    tokenHash,
    userId: caller.userId,
    characterId,
    expectedRevision: peek.revision,
    state: outcome.state,
    actor: actorName(outcome.state, ctx) ?? null,
    command,
    entries: outcome.logged,
  });
  if (status === 'conflict') return 'conflict';
  if (status === 'ok') return reply(200, { gameId: peek.gameId, characterId });
  return joinRefused(status);
}

function joinCommand(
  choice: JoinChoice,
): Extract<GameCommand, { type: 'character_join' | 'character_claim' }> {
  if (choice.kind === 'claim') return { type: 'character_claim', characterId: choice.characterId };
  return {
    type: 'character_join',
    id: newId('char'),
    name: choice.name,
    color: choice.color,
    portrait: choice.portrait,
  };
}

/**
 * The master unlinks a player from their character: the character and its
 * wallet stay, only the link goes, and the log says so.
 */
export async function unlinkPlayer(
  { gameId, userId }: { gameId: string; userId: string },
  caller: Caller,
): Promise<GameResponse> {
  for (let attempt = 0; attempt < MAX_JOIN_ATTEMPTS; attempt += 1) {
    const game = await loadAsMaster(gameId, caller);
    if (!isGame(game)) return game;
    const player = await caller.db.loadForMember(gameId, userId);
    if (player?.role !== 'player' || !player.characterId) return reply(404, { error: 'not_found' });

    const stored = parseState(game.state, caller.catalog);
    if (!stored.ok) throw new Error(`stored game ${gameId} is invalid: ${stored.error}`);
    const release = releaseOf(stored.state, player.characterId, caller);
    const status = await caller.db.unlinkPlayer({
      gameId,
      unlinkedUserId: userId,
      expectedRevision: game.revision,
      userId: caller.userId,
      actor: MASTER_ACTOR,
      ...release,
    });
    if (status === 'ok') return reply(200, { unlinked: true });
    if (status === 'not_found') return reply(404, { error: 'not_found' });
  }
  return conflict();
}

/** The next state and log line; a character already deleted leaves no line. */
function releaseOf(state: GameState, characterId: string, { catalog }: Caller) {
  const command = { type: 'character_release', characterId } as const;
  const ctx: CommandContext = { actor: { role: 'master' }, membership: true };
  const outcome = applyCommand(state, catalog, command, ctx);
  if (outcome.ok) return { state: outcome.state, command, entries: outcome.logged };
  return { state: { ...state, revision: state.revision + 1 }, command, entries: [] };
}

function storedState(peek: OpenPeek, { catalog }: Caller): GameState {
  const stored = parseState(peek.state, catalog);
  if (!stored.ok) throw new Error(`stored game ${peek.gameId} is invalid: ${stored.error}`);
  return stored.state;
}

/** Where the small version of an uploaded portrait sits in the game-images bucket. */
function uploadThumbPath(gameId: string, character: Character): string | null {
  const upload = parseUploadRef(character.portrait);
  return upload ? `${gameId}/${imagePath(fileRef(upload), 'thumb')}` : null;
}

/** Asset keys and URLs as they are; uploads as a signed URL (the joining user is not a member yet). */
function shownPortrait(
  gameId: string,
  character: Character,
  photos: Readonly<Record<string, string>>,
): string | undefined {
  const path = uploadThumbPath(gameId, character);
  return path ? photos[path] : character.portrait;
}

const LINK_REFUSAL_STATUS: Record<JoinLinkRefusal, number> = {
  invalid: 404,
  revoked: 410,
  expired: 410,
};

function linkRefused(status: JoinLinkRefusal): GameResponse {
  return reply(LINK_REFUSAL_STATUS[status], { error: `join_${status}` });
}

function joinRefused(status: Exclude<JoinStatus, 'ok' | 'conflict'>): GameResponse {
  if (status === 'already_member' || status === 'character_taken') {
    return reply(409, { error: status });
  }
  return linkRefused(status);
}

const DAY_MS = 24 * 60 * 60 * 1000;
