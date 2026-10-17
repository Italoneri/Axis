import { describe, expect, it } from 'vitest';
import { gameStateSchema } from '../model/schema';
import { toBronze } from '../systems/Coins';
import { serializeState, createInitialState } from '../systems/SaveSystem';
import { serverCatalog } from './catalog';
import { handleGameRequest, sha256Hex, type GameResponse } from './handler';
import { MemoryDb } from './memoryDb';

const MASTER = 'user-master';
const PLAYER = 'user-player';
const character = serverCatalog.seed.wallets.characters[0]?.id ?? '';
const noPhotos = { signPhotos: () => Promise.resolve({}) };

function setup() {
  const db = new MemoryDb();
  const request = (body: unknown, userId: string = MASTER): Promise<GameResponse> =>
    handleGameRequest(
      { authorization: `Bearer ${userId}`, body },
      {
        db,
        catalog: serverCatalog,
        auth: { userFromToken: (t) => Promise.resolve(t) },
        photos: noPhotos,
      },
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

describe('join links', () => {
  const NEWCOMER = 'user-newcomer';

  async function withLink(expiresInDays?: number) {
    const context = setup();
    const gameId = await context.createGame();
    const created = await context.request({ action: 'create_join_link', gameId, expiresInDays });
    const token = String(created.body['token']);
    const join = (choice: unknown, userId = NEWCOMER) =>
      context.request({ action: 'join_game', token, choice }, userId);
    return { ...context, gameId, created, token, join };
  }

  const create = { kind: 'create', name: 'Bruna', color: '#6a8fd4' } as const;

  it('creates a reusable link that never expires unless asked, storing only its hash', async () => {
    const { db, created, token } = await withLink();
    expect(created).toMatchObject({ status: 201, body: { expiresAt: null } });
    expect(db.joinLinks[0]?.tokenHash).toBe(await sha256Hex(token));
    expect(JSON.stringify(db.joinLinks)).not.toContain(token);
  });

  it('lists the characters without a player to someone about to join', async () => {
    const { request, gameId, token, join } = await withLink();
    const before = await request({ action: 'join_preview', token }, NEWCOMER);
    expect(before).toMatchObject({
      status: 200,
      body: { gameId, gameName: 'Axis', isMember: false },
    });
    expect(before.body['characters']).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: character })]),
    );
    await join({ kind: 'claim', characterId: character }, PLAYER);
    const after = await request({ action: 'join_preview', token }, NEWCOMER);
    expect(after.body['characters']).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: character })]),
    );
  });

  it('links a player to a free character and logs it', async () => {
    const { db, gameId, join } = await withLink();
    const joined = await join({ kind: 'claim', characterId: character });
    expect(joined).toEqual({ status: 200, body: { gameId, characterId: character } });
    expect(db.players.get(`${gameId}:${NEWCOMER}`)).toEqual({
      role: 'player',
      characterId: character,
    });
    expect(db.games.get(gameId)).toMatchObject({
      revision: 1,
      state: {
        log: expect.arrayContaining([expect.objectContaining({ kind: 'character_claimed' })]),
      },
    });
  });

  it('creates the player character with an empty wallet', async () => {
    const { db, gameId, join } = await withLink();
    const joined = await join({ ...create, portrait: 'https://lh3.googleusercontent.com/a/x' });
    const characterId = String(joined.body['characterId']);
    expect(joined.status).toBe(200);
    expect(db.games.get(gameId)?.state).toMatchObject({
      characters: expect.arrayContaining([
        {
          id: characterId,
          name: 'Bruna',
          color: '#6a8fd4',
          portrait: 'https://lh3.googleusercontent.com/a/x',
        },
      ]),
      wallets: { characters: expect.objectContaining({ [characterId]: {} }) },
    });
    expect(db.players.get(`${gameId}:${NEWCOMER}`)?.characterId).toBe(characterId);
  });

  it.each([
    {
      name: 'a character someone already plays',
      setup: 'taken',
      status: 409,
      error: 'character_taken',
    },
    {
      name: 'a second character for the same user',
      setup: 'member',
      status: 409,
      error: 'already_member',
    },
  ] as const)('refuses $name', async ({ setup: arrange, status, error }) => {
    const { join } = await withLink();
    await join({ kind: 'claim', characterId: character }, arrange === 'taken' ? PLAYER : NEWCOMER);
    const refused = await join(
      arrange === 'taken' ? { kind: 'claim', characterId: character } : create,
    );
    expect(refused).toMatchObject({ status, body: { error } });
  });

  it.each([
    { name: 'an empty name', choice: { ...create, name: '  ' }, reason: 'empty_name' },
    {
      name: 'the name of a character at the table',
      choice: { ...create, name: serverCatalog.seed.wallets.characters[0]?.name ?? '' },
      reason: 'duplicate_name',
    },
  ])('refuses a new character with $name', async ({ choice, reason }) => {
    const { join } = await withLink();
    expect(await join(choice)).toMatchObject({ status: 422, body: { reason } });
  });

  it('refuses an uploaded photo before the player is in the game', async () => {
    const { join } = await withLink();
    const choice = { ...create, portrait: 'upload:character/x/img_1.webp' };
    expect((await join(choice)).status).toBe(422);
  });

  it('stops working once revoked or expired', async () => {
    const { request, gameId, created, join, db } = await withLink(7);
    const linkId = created.body['linkId'];
    expect((await request({ action: 'revoke_join_link', gameId, linkId })).status).toBe(200);
    expect(await join(create)).toEqual({ status: 410, body: { error: 'join_revoked' } });
    const link = db.joinLinks[0];
    if (link) Object.assign(link, { revoked: false, expiresAt: new Date(Date.now() - 1000) });
    expect(await join(create)).toEqual({ status: 410, body: { error: 'join_expired' } });
  });

  it('refuses an unknown link and lets only the master create one', async () => {
    const { request, gameId } = await withLink();
    const unknown = await request({ action: 'join_preview', token: 'x'.repeat(43) }, NEWCOMER);
    expect(unknown).toEqual({ status: 404, body: { error: 'join_invalid' } });
    const byStranger = await request({ action: 'create_join_link', gameId }, NEWCOMER);
    expect(byStranger).toEqual({ status: 403, body: { error: 'not_member' } });
  });

  it('lets the master unlink a player, keeping the character and its wallet', async () => {
    const { db, request, gameId, join } = await withLink();
    await join({ kind: 'claim', characterId: character });
    const userId = '00000000-0000-4000-8000-0000000000ff';
    db.players.set(
      `${gameId}:${userId}`,
      db.players.get(`${gameId}:${NEWCOMER}`) ?? { role: 'player', characterId: character },
    );
    db.players.delete(`${gameId}:${NEWCOMER}`);
    const unlinked = await request({ action: 'unlink_player', gameId, userId });
    expect(unlinked.status).toBe(200);
    expect(db.players.has(`${gameId}:${userId}`)).toBe(false);
    expect(db.games.get(gameId)?.state).toMatchObject({
      characters: expect.arrayContaining([expect.objectContaining({ id: character })]),
      log: expect.arrayContaining([expect.objectContaining({ kind: 'character_released' })]),
    });
  });

  it('never unlinks the master', async () => {
    const { request, gameId } = await withLink();
    const userId = '00000000-0000-4000-8000-0000000000aa';
    const refused = await request({ action: 'unlink_player', gameId, userId }, MASTER);
    expect(refused.status).toBe(404);
  });
});

describe('shop purchases', () => {
  const sword = {
    id: 'shop_sword',
    kind: 'equipment',
    name: 'Espada curta',
    description: 'Afiada.',
    depotKind: 'equipamento',
    price: { bronze: 5 },
    stock: null,
    minLevel: 1,
    featured: false,
    hidden: false,
  } as const;

  async function withShop() {
    const context = setup();
    const seed = createInitialState(serverCatalog);
    const gameId = await context.createGame({
      ...seed,
      slots: { mid_1: { buildingId: 'trading_post', level: 1, status: 'done' } },
      shop: { items: [...seed.shop.items, sword] },
    });
    context.db.players.set(`${gameId}:${PLAYER}`, { role: 'player', characterId: character });
    const buy = (itemId: string) =>
      context.request(
        {
          action: 'command',
          gameId,
          expectedRevision: 0,
          command: {
            type: 'shop_buy',
            itemId,
            quantity: 1,
            payer: { kind: 'camp' },
            deliveryId: 'delivery_1',
          },
        },
        PLAYER,
      );
    const campBronze = () => {
      const parsed = gameStateSchema.parse(context.db.games.get(gameId)?.state);
      return toBronze(parsed.wallets.camp, serverCatalog.currencies);
    };
    return { ...context, gameId, buy, campBronze };
  }

  it('commitsEquipmentPurchaseWithDelivery', async () => {
    const { db, buy, campBronze } = await withShop();
    const before = campBronze();
    expect((await buy('shop_sword')).status).toBe(200);
    expect(db.deliveries).toEqual([
      {
        itemId: 'delivery_1',
        ownerId: character,
        authorId: character,
        name: 'Espada curta',
        kind: 'equipamento',
        quantity: 1,
        notes: 'Afiada.',
      },
    ]);
    expect(campBronze()).toBe(before - 5);
  });

  it('materialPurchaseUsesPlainCommit', async () => {
    const { db, gameId, buy } = await withShop();
    expect((await buy('shop_wood')).status).toBe(200);
    expect(db.deliveries).toEqual([]);
    expect(db.games.get(gameId)?.revision).toBe(1);
  });

  it('conflictLeavesNoDelivery', async () => {
    const { db, buy } = await withShop();
    const load = db.loadForMember.bind(db);
    // Someone else saves between the load and the commit.
    db.loadForMember = async (id, userId) => {
      const game = await load(id, userId);
      const stored = db.games.get(id);
      if (stored) db.games.set(id, { ...stored, revision: stored.revision + 1 });
      return game;
    };
    expect((await buy('shop_sword')).status).toBe(409);
    expect(db.deliveries).toEqual([]);
  });
});
