import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Actor, CommandContext } from '../commands/schema';
import { t } from '../i18n/pt-BR';
import type { Catalog } from '../model/catalog';
import { parseSave } from '../systems/SaveSystem';
import type { GameStore } from '../store';
import type { DrawerExtras } from '../ui/InfoDrawer';
import type { MasterAccess } from '../ui/MasterSession';
import { HistoryPanel } from './HistoryPanel';
import { InvitesPanel } from './InvitesPanel';
import {
  followJoinLink,
  gameUrl,
  signInWithGoogle,
  submitJoin,
  suggestionFrom,
  withoutParam,
} from './joinLink';
import { PlayersPanel } from './PlayersPanel';
import { showCreateGame, showJoinGame, showLogin, showMessage, type JoinChoice } from './screens';
import type { OnlineConfig } from './config';
import {
  createSupabase,
  supabaseArchiveBackend,
  supabaseBackend,
  supabaseImageBucket,
} from './supabase';
import { SupabaseArchiveRepository } from './SupabaseArchiveRepository';
import { ARCHIVE_IMAGE_BUCKET, GAME_IMAGE_BUCKET, SupabaseImageStore } from './SupabaseImageStore';
import type { ArchiveImageStore } from '../persistence/ArchiveImageStore';
import { SupabaseRepository, type GameBackend } from './SupabaseRepository';

export interface Membership {
  gameId: string;
  gameName: string;
  role: 'master' | 'player';
  characterId: string | null;
}

export interface OnlineGame {
  repository: SupabaseRepository;
  archiveRepository: SupabaseArchiveRepository;
  archiveImages: ArchiveImageStore;
  /** Files of the photos of characters, NPCs, materials and worlds. */
  gamePhotos: ArchiveImageStore;
  /** Who writes in the Arquivo de registros: fixed by the login. */
  archiveActor: Actor;
  membership: Membership;
  access: MasterAccess;
  backend: GameBackend;
  client: SupabaseClient;
  /** What this device assumes for the optimistic update; the server decides from the login. */
  contextFor: () => CommandContext;
  /** Online panels of the drawer, built once the store exists. */
  drawerExtras: (store: GameStore, notify: Notify) => DrawerExtras;
}

type Notify = (message: string, tone?: 'error') => void;

/**
 * Gets the player into a game: login (Google or magic link), an invite or the
 * game's entry link in the URL, or creating a game. Resolves to null while a
 * screen (login, join, create) is waiting for the user; those screens reload
 * the page when done.
 */
export async function bootOnline(
  config: OnlineConfig,
  catalog: Catalog,
  notify: Notify,
): Promise<OnlineGame | null> {
  const client = createSupabase(config);
  const backend = supabaseBackend(client, config);
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  if (!user) {
    showLogin({
      google: () => signInWithGoogle(client.auth, window.location.href),
      sendLink: (email) => sendMagicLink(client, email),
    });
    return null;
  }

  const link = readLinkParams(new URL(window.location.href));
  const invitedGame = link.invite ? await acceptInvite(backend, link.invite, notify) : null;
  if (link.invite) dropParam('invite');

  let requestedGame = invitedGame ?? link.gameId;
  if (link.join) {
    const token = link.join;
    const step = await followJoinLink(backend, token);
    if (step.kind === 'choose') {
      showJoinGame({
        preview: step.preview,
        catalog,
        suggestion: suggestionFrom(user.user_metadata),
        join: (choice) => joinAndOpen(backend, token, choice),
      });
      return null;
    }
    dropParam('join');
    if (step.kind === 'open') requestedGame = step.gameId;
    else notify(step.message, 'error');
  }

  showMessage(t.online.loading);
  const membership = chooseMembership(await loadMemberships(client, user.id), requestedGame);
  if (!membership) {
    showCreateGame((name, saveText) => createGame(backend, catalog, { name, saveText }));
    return null;
  }

  const signOut = () => void client.auth.signOut().then(() => window.location.reload());
  return {
    repository: new SupabaseRepository(backend, membership.gameId, catalog),
    archiveRepository: new SupabaseArchiveRepository(
      supabaseArchiveBackend(client),
      membership.gameId,
    ),
    archiveImages: new SupabaseImageStore(
      supabaseImageBucket(client, ARCHIVE_IMAGE_BUCKET),
      membership.gameId,
    ),
    gamePhotos: new SupabaseImageStore(
      supabaseImageBucket(client, GAME_IMAGE_BUCKET),
      membership.gameId,
    ),
    archiveActor: onlineContext(membership).actor,
    membership,
    access: new OnlineAccess(membership.role, signOut),
    backend,
    client,
    contextFor: () => onlineContext(membership),
    drawerExtras: (store, notify) => {
      const panelDeps = { client, backend, gameId: membership.gameId, store, notify };
      const isMaster = membership.role === 'master';
      return {
        history: new HistoryPanel({ client, gameId: membership.gameId, store }),
        players: isMaster ? new PlayersPanel(panelDeps) : undefined,
        invites: isMaster ? new InvitesPanel(panelDeps) : undefined,
      };
    },
  };
}

/** The role comes from the login: there is nothing to unlock, only to sign out of. */
class OnlineAccess implements MasterAccess {
  readonly isConfigured = true;
  readonly leaveLabel = t.online.signOut;

  constructor(
    private readonly role: Membership['role'],
    private readonly signOut: () => void,
  ) {}

  get isActive(): boolean {
    return this.role === 'master';
  }

  subscribe(): void {
    // The role is fixed for the whole visit: a change means signing in again.
  }

  lock(): void {
    this.signOut();
  }
}

export function onlineContext({ role, characterId }: Membership): CommandContext {
  if (role === 'master') return { actor: { role: 'master' } };
  return { actor: { role: 'player', characterId: characterId ?? undefined } };
}

export interface LinkParams {
  /** `?invite=<token>`: a master's invite for one character. */
  invite: string | null;
  /** `?join=<token>`: the game's entry link. */
  join: string | null;
  /** `?game=<id>`: which of several games to open. */
  gameId: string | null;
}

export function readLinkParams(url: URL): LinkParams {
  return {
    invite: url.searchParams.get('invite'),
    join: url.searchParams.get('join'),
    gameId: url.searchParams.get('game'),
  };
}

function dropParam(name: 'invite' | 'join'): void {
  window.history.replaceState(null, '', withoutParam(new URL(window.location.href), name));
}

/** Returns a message for the join screen, or reloads into the game. */
async function joinAndOpen(
  backend: GameBackend,
  token: string,
  choice: JoinChoice,
): Promise<string | null> {
  const result = await submitJoin(backend, token, choice);
  if ('message' in result) return result.message;
  window.location.assign(gameUrl(new URL(window.location.href), result.gameId));
  return null;
}

/** The requested game when the user is in it; otherwise the first one. */
export function chooseMembership(
  memberships: readonly Membership[],
  requestedGameId: string | null,
): Membership | null {
  return memberships.find((m) => m.gameId === requestedGameId) ?? memberships[0] ?? null;
}

const membershipRowsSchema = z.array(
  z.object({
    game_id: z.string(),
    role: z.enum(['master', 'player']),
    character_id: z.string().nullable(),
    games: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() }))]),
  }),
);

async function loadMemberships(client: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await client
    .from('players')
    .select('game_id, role, character_id, games(name)')
    .eq('user_id', userId)
    .order('joined_at')
    .limit(50);
  if (error) throw new Error(`load memberships: ${error.message}`);
  return membershipRowsSchema.parse(data).map((row) => ({
    gameId: row.game_id,
    gameName: (Array.isArray(row.games) ? row.games[0]?.name : row.games.name) ?? '',
    role: row.role,
    characterId: row.character_id,
  }));
}

async function sendMagicLink(client: SupabaseClient, email: string): Promise<boolean> {
  // Back to this exact URL, so an invite in it survives the login.
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) console.error('[online] magic link', error.message);
  return !error;
}

const acceptedSchema = z.object({ gameId: z.string() });
const errorSchema = z.object({ error: z.string() });

async function acceptInvite(
  backend: GameBackend,
  token: string,
  notify: Notify,
): Promise<string | null> {
  const reply = await backend.callFunction({ action: 'accept_invite', token });
  const accepted = acceptedSchema.safeParse(reply.body);
  if (reply.status === 200 && accepted.success) {
    notify(t.online.inviteAccepted);
    return accepted.data.gameId;
  }
  const code = errorSchema.safeParse(reply.body);
  const message = code.success ? t.online.inviteRefused.get(code.data.error) : undefined;
  notify(message ?? t.online.inviteFailed, 'error');
  return null;
}

const createdSchema = z.object({ gameId: z.string() });

/** Returns an error message, or reloads into the new game. */
async function createGame(
  backend: GameBackend,
  catalog: Catalog,
  { name, saveText }: { name: string; saveText: string | null },
): Promise<string | null> {
  let state: unknown;
  if (saveText !== null) {
    const parsed = parseSave(saveText, catalog);
    if (!parsed.ok) return t.save.invalid(parsed.error);
    state = parsed.state;
  }
  const reply = await backend.callFunction({ action: 'create_game', name, state });
  const created = createdSchema.safeParse(reply.body);
  if (reply.status !== 201 || !created.success) {
    console.error('[online] create game', reply);
    return t.online.createFailed;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('game', created.data.gameId);
  window.location.assign(url.toString());
  return null;
}
