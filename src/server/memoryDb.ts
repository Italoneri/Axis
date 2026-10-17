import type { DepotDelivery } from '../systems/Depot';
import type {
  GameDb,
  InviteAcceptance,
  JoinPeek,
  JoinStatus,
  JoinUpdate,
  MemberGame,
  NewJoinLink,
  UnlinkStatus,
  UnlinkUpdate,
} from './gameDb';

interface Invite {
  id: string;
  gameId: string;
  characterId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  revoked: boolean;
}

interface JoinLink extends NewJoinLink {
  id: string;
  revoked: boolean;
}

/** In-memory GameDb with the same rules as the SQL functions in supabase/migrations (tests only). */
export class MemoryDb implements GameDb {
  games = new Map<string, { state: unknown; revision: number }>();
  players = new Map<string, { role: 'master' | 'player'; characterId: string | null }>();
  invites: Invite[] = [];
  joinLinks: JoinLink[] = [];
  names = new Map<string, string>();
  deliveries: DepotDelivery[] = [];
  /** The command stored with each accepted update, as the game_log row would keep it. */
  loggedCommands: unknown[] = [];
  private nextId = 1;

  private uuid(): string {
    return `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, '0')}`;
  }

  loadForMember(gameId: string, userId: string): Promise<MemberGame | null> {
    const game = this.games.get(gameId);
    const player = this.players.get(`${gameId}:${userId}`);
    return Promise.resolve(game && player ? { ...game, ...player } : null);
  }

  commitUpdate({
    gameId,
    expectedRevision,
    state,
    command,
  }: Parameters<GameDb['commitUpdate']>[0]) {
    const game = this.games.get(gameId);
    if (!game || game.revision !== expectedRevision) return Promise.resolve(false);
    this.loggedCommands.push(command);
    this.games.set(gameId, { state, revision: expectedRevision + 1 });
    return Promise.resolve(true);
  }

  async commitPurchase({ delivery, ...update }: Parameters<GameDb['commitPurchase']>[0]) {
    if (!(await this.commitUpdate(update))) return false;
    this.deliveries.push(delivery);
    return true;
  }

  createGame(name: string, state: unknown, ownerId: string): Promise<string> {
    const id = this.uuid();
    this.names.set(id, name);
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

  createJoinLink(link: NewJoinLink): Promise<string> {
    const id = this.uuid();
    this.joinLinks.push({ ...link, id, revoked: false });
    return Promise.resolve(id);
  }

  revokeJoinLink(gameId: string, linkId: string): Promise<boolean> {
    const link = this.joinLinks.find((l) => l.id === linkId && l.gameId === gameId);
    if (!link || link.revoked) return Promise.resolve(false);
    link.revoked = true;
    return Promise.resolve(true);
  }

  peekJoin(tokenHash: string, userId: string): Promise<JoinPeek> {
    const link = this.joinLinks.find((l) => l.tokenHash === tokenHash);
    const refusal = linkRefusal(link);
    const game = link && this.games.get(link.gameId);
    if (refusal || !link || !game) return Promise.resolve({ status: refusal ?? 'invalid' });
    return Promise.resolve({
      status: 'ok',
      gameId: link.gameId,
      gameName: this.names.get(link.gameId) ?? '',
      ...game,
      isMember: this.players.has(`${link.gameId}:${userId}`),
      taken: this.takenCharacters(link.gameId),
    });
  }

  async joinGame(join: JoinUpdate): Promise<JoinStatus> {
    const link = this.joinLinks.find((l) => l.tokenHash === join.tokenHash);
    const refusal = linkRefusal(link);
    if (refusal || !link) return refusal ?? 'invalid';
    if (this.players.has(`${link.gameId}:${join.userId}`)) return 'already_member';
    if (this.takenCharacters(link.gameId).includes(join.characterId)) return 'character_taken';
    if (!(await this.commitUpdate({ ...join, gameId: link.gameId }))) return 'conflict';
    this.players.set(`${link.gameId}:${join.userId}`, {
      role: 'player',
      characterId: join.characterId,
    });
    return 'ok';
  }

  async unlinkPlayer(unlink: UnlinkUpdate): Promise<UnlinkStatus> {
    const key = `${unlink.gameId}:${unlink.unlinkedUserId}`;
    if (this.players.get(key)?.role !== 'player') return 'not_found';
    if (!(await this.commitUpdate(unlink))) return 'conflict';
    this.players.delete(key);
    return 'ok';
  }

  private takenCharacters(gameId: string): string[] {
    return [...this.players]
      .filter(([key, player]) => key.startsWith(`${gameId}:`) && player.characterId)
      .map(([, player]) => player.characterId ?? '');
  }
}

function linkRefusal(link: JoinLink | undefined): 'invalid' | 'revoked' | 'expired' | null {
  if (!link) return 'invalid';
  if (link.revoked) return 'revoked';
  if (link.expiresAt && link.expiresAt <= new Date()) return 'expired';
  return null;
}
