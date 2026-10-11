import { describe, expect, it } from 'vitest';
import { serializeState, createInitialState } from '../systems/SaveSystem';
import { serverCatalog } from './catalog';
import type { GameDb, InviteAcceptance, MemberGame } from './gameDb';
import { handleGameRequest, sha256Hex, type GameResponse } from './handler';

const MASTER = 'user-master';
const PLAYER = 'user-player';
const character = serverCatalog.seed.wallets.characters[0]?.id ?? '';

interface Invite {
  id: string;
  gameId: string;
  characterId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  revoked: boolean;
}

/** In-memory GameDb with the same rules as the SQL functions. */
class MemoryDb implements GameDb {
  games = new Map<string, { state: unknown; revision: number }>();
  players = new Map<string, { role: 'master' | 'player'; characterId: string | null }>();
  invites: Invite[] = [];
  private nextId = 1;

  private uuid(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  loadForMember(gameId: string, userId: string): Promise<MemberGame | null> {
    const game = this.games.get(gameId);
    const player = this.players.get(`${gameId}:${userId}`);
    return Promise.resolve(game && player ? { ...game, ...player } : null);
  }

  commitUpdate({ gameId, expectedRevision, state }: Parameters<GameDb['commitUpdate']>[0]) {
    const game = this.games.get(gameId);
    if (!game || game.revision !== expectedRevision) return Promise.resolve(false);
    this.games.set(gameId, { state, revision: expectedRevision + 1 });
    return Promise.resolve(true);
  }

  createGame(_name: string, state: unknown, ownerId: string): Promise<string> {
    const id = this.uuid();
    this.games.set(id, { state, revision: 0 });
    this.players.set(`${id}:${ownerId}`, { role: 'master', characterId: null });
    return Promise.resolve(id);
  }

  createInvite(invite: Parameters<GameDb['createInvite']>[0]): Promise<string> {
    const id = this.uuid();
    this.invites.push({ ...invite, id, used: false, revoked: false });
    return Promise.resolve(id);
  }

  acceptInvite(tokenHash: string, userId: string): Promise<InviteAcceptance> {
    const invite = this.invites.find((i) => i.tokenHash === tokenHash);
    const result = (status: InviteAcceptance['status']) =>
      Promise.resolve({ status, gameId: invite?.gameId ?? null });
    if (!invite) return result('invalid');
    if (invite.revoked) return result('revoked');
    if (invite.used) return result('used');
    if (invite.expiresAt <= new Date()) return result('expired');
    if (this.players.get(`${invite.gameId}:${userId}`)?.role === 'master')
      return result('is_master');
    invite.used = true;
    this.players.set(`${invite.gameId}:${userId}`, {
      role: 'player',
      characterId: invite.characterId,
    });
    return result('ok');
  }

  revokeInvite(gameId: string, inviteId: string): Promise<boolean> {
    const invite = this.invites.find((i) => i.id === inviteId && i.gameId === gameId);
    if (!invite || invite.used || invite.revoked) return Promise.resolve(false);
    invite.revoked = true;
    return Promise.resolve(true);
  }
}

function setup() {
  const db = new MemoryDb();
  const request = (body: unknown, userId: string = MASTER): Promise<GameResponse> =>
    handleGameRequest(
      { authorization: `Bearer ${userId}`, body },
      { db, catalog: serverCatalog, auth: { userFromToken: (t) => Promise.resolve(t) } },
    );
  const createGame = async (state?: unknown) => {
    const response = await request({ action: 'create_game', name: 'Axis', state });
    return String(response.body['gameId']);
  };
  return { db, request, createGame };
}

describe('create_game', () => {
  it('starts from the seed and makes the creator the master', async () => {
    const { db, createGame } = setup();
    const gameId = await createGame();
    expect(db.games.get(gameId)?.state).toEqual(createInitialState(serverCatalog));
    expect(db.players.get(`${gameId}:${MASTER}`)?.role).toBe('master');
  });

  it('starts from an imported save, with a fresh revision', async () => {
    const { db, createGame } = setup();
    const save = JSON.parse(
      serializeState({ ...createInitialState(serverCatalog), day: 12, revision: 40 }),
    ) as unknown;
    const gameId = await createGame(save);
    expect(db.games.get(gameId)?.state).toMatchObject({ day: 12, revision: 0 });
  });

  it('refuses a broken save', async () => {
    const { request } = setup();
    const response = await request({ action: 'create_game', name: 'Axis', state: { day: 'x' } });
    expect(response).toMatchObject({ status: 422, body: { error: 'invalid_save' } });
  });
});

describe('restore_save', () => {
  it('lets the master replace the game with a backup as the next revision', async () => {
    const { db, request, createGame } = setup();
    const gameId = await createGame();
    const backup = { ...createInitialState(serverCatalog), day: 30 };
    const response = await request({
      action: 'restore_save',
      gameId,
      state: backup,
      expectedRevision: 0,
    });
    expect(response.status).toBe(200);
    expect(db.games.get(gameId)).toMatchObject({ revision: 1, state: { day: 30, revision: 1 } });
  });

  it('is refused to a player', async () => {
    const { db, request, createGame } = setup();
    const gameId = await createGame();
    db.players.set(`${gameId}:${PLAYER}`, { role: 'player', characterId: character });
    const backup = createInitialState(serverCatalog);
    const body = { action: 'restore_save', gameId, state: backup, expectedRevision: 0 };
    expect((await request(body, PLAYER)).status).toBe(403);
  });
});

describe('invites', () => {
  async function invited() {
    const context = setup();
    const gameId = await context.createGame();
    const created = await context.request({
      action: 'create_invite',
      gameId,
      characterId: character,
    });
    return { ...context, gameId, created, token: String(created.body['token']) };
  }

  it('creates a single-use link token, storing only its hash', async () => {
    const { db, created, token } = await invited();
    expect(created.status).toBe(201);
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(db.invites[0]?.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(db.invites)).not.toContain(token);
  });

  it('links the player who accepts it to the character, once', async () => {
    const { db, request, gameId, token } = await invited();
    const accepted = await request({ action: 'accept_invite', token }, PLAYER);
    expect(accepted).toEqual({ status: 200, body: { gameId } });
    expect(db.players.get(`${gameId}:${PLAYER}`)).toEqual({
      role: 'player',
      characterId: character,
    });
    const again = await request({ action: 'accept_invite', token }, 'user-other');
    expect(again).toEqual({ status: 410, body: { error: 'invite_used' } });
  });

  it('stops working once revoked', async () => {
    const { request, gameId, created, token } = await invited();
    const inviteId = created.body['inviteId'];
    expect((await request({ action: 'revoke_invite', gameId, inviteId })).status).toBe(200);
    const accepted = await request({ action: 'accept_invite', token }, PLAYER);
    expect(accepted).toEqual({ status: 410, body: { error: 'invite_revoked' } });
  });

  it('refuses unknown tokens, unknown characters and non-masters', async () => {
    const { request, gameId } = await invited();
    const unknownToken = await request({ action: 'accept_invite', token: 'x'.repeat(43) }, PLAYER);
    expect(unknownToken.status).toBe(404);
    const unknownCharacter = await request({
      action: 'create_invite',
      gameId,
      characterId: 'ghost',
    });
    expect(unknownCharacter.status).toBe(404);
    const byStranger = await request(
      { action: 'create_invite', gameId, characterId: character },
      PLAYER,
    );
    expect(byStranger).toEqual({ status: 403, body: { error: 'not_member' } });
  });
});
