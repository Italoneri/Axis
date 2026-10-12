import { z } from 'zod';
import { t } from '../i18n/pt-BR';
import type { JoinChoice, JoinPreview, JoinSuggestion } from './screens';
import type { FunctionReply, GameBackend } from './SupabaseRepository';

// The game's entry link (`?join=<token>`) on the client: what to do with it
// once the user is logged in, and the call that links them to a character.
// The DOM stays in screens.ts, so this runs in tests with a fake backend.

/** Where the entry link leads: into a game, a screen waiting for a choice, or nowhere. */
export type JoinStep =
  | { kind: 'open'; gameId: string }
  | { kind: 'choose'; preview: JoinPreview }
  | { kind: 'refused'; message: string };

const previewSchema = z.object({
  gameId: z.string(),
  gameName: z.string(),
  isMember: z.boolean(),
  characters: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      portrait: z.string().optional(),
    }),
  ),
});

export async function followJoinLink(backend: GameBackend, token: string): Promise<JoinStep> {
  const reply = await backend.callFunction({ action: 'join_preview', token });
  const preview = previewSchema.safeParse(reply.body);
  if (reply.status !== 200 || !preview.success) {
    return { kind: 'refused', message: refusalMessage(reply) };
  }
  // Someone already at the table (a player coming back, the master testing the link) just goes in.
  if (preview.data.isMember) return { kind: 'open', gameId: preview.data.gameId };
  return { kind: 'choose', preview: preview.data };
}

const joinedSchema = z.object({ gameId: z.string() });
const alreadyMemberSchema = z.object({ error: z.literal('already_member'), gameId: z.string() });

/** The game to open once linked, or the message to show on the join screen. */
export async function submitJoin(
  backend: GameBackend,
  token: string,
  choice: JoinChoice,
): Promise<{ gameId: string } | { message: string }> {
  const reply = await backend.callFunction({ action: 'join_game', token, choice });
  const joined = joinedSchema.safeParse(reply.body);
  if (reply.status === 200 && joined.success) return { gameId: joined.data.gameId };
  const member = alreadyMemberSchema.safeParse(reply.body);
  if (member.success) return { gameId: member.data.gameId };
  return { message: refusalMessage(reply) };
}

const refusalSchema = z.object({ error: z.string(), reason: z.string().optional() });

function refusalMessage(reply: FunctionReply): string {
  const refusal = refusalSchema.safeParse(reply.body);
  if (!refusal.success) {
    console.error('[online] join', reply);
    return t.online.joinFailed;
  }
  const { error, reason } = refusal.data;
  return t.online.joinRefused.get(reason ?? error) ?? t.online.joinFailed;
}

const googleProfileSchema = z.object({
  full_name: z.string().optional(),
  name: z.string().optional(),
  avatar_url: z.string().optional(),
  picture: z.string().optional(),
});

/** Name and photo from the Google account, as a start for a new character. */
export function suggestionFrom(userMetadata: unknown): JoinSuggestion {
  const profile = googleProfileSchema.safeParse(userMetadata);
  if (!profile.success) return { name: '' };
  const { full_name, name, avatar_url, picture } = profile.data;
  const photo = avatar_url ?? picture;
  return {
    name: (full_name ?? name ?? '').split(' ')[0] ?? '',
    ...(photo?.startsWith('https://') ? { portrait: photo } : {}),
  };
}

/** Back to the same URL after Google, so `?game=`, `?invite=` and `?join=` survive the login. */
export async function signInWithGoogle(
  auth: {
    signInWithOAuth(credentials: {
      provider: 'google';
      options: { redirectTo: string };
    }): Promise<{ error: { message: string } | null }>;
  },
  href: string,
): Promise<boolean> {
  const { error } = await auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: href },
  });
  if (error) console.error('[online] google login', error.message);
  return !error;
}

/** The URL of a game, without the one-time link parameters. */
export function gameUrl(url: URL, gameId: string): string {
  const next = withoutParam(url, 'join');
  const parsed = new URL(next);
  parsed.searchParams.set('game', gameId);
  return parsed.toString();
}

/** The same URL without a link parameter, so a reload does not use it again. */
export function withoutParam(url: URL, name: 'invite' | 'join'): string {
  const next = new URL(url);
  next.searchParams.delete(name);
  return next.toString();
}
