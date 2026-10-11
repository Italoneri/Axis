import type { GameDb, InviteAcceptance, MemberGame } from './gameDb';

interface Invite {
  id: string;
  gameId: string;
  characterId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  revoked: boolean;
}

/** In-memory GameDb with the same rules as the SQL functions in supabase/migrations (tests only). */
export class MemoryDb implements GameDb {
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
