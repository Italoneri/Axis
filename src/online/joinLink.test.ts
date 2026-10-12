import { describe, expect, it, vi } from 'vitest';
import {
  followJoinLink,
  gameUrl,
  signInWithGoogle,
  submitJoin,
  suggestionFrom,
  withoutParam,
} from './joinLink';
import type { FunctionReply, GameBackend } from './SupabaseRepository';

const TOKEN = 't'.repeat(43);
const preview = {
  gameId: 'g1',
  gameName: 'Axis',
  characters: [{ id: 'thorin', name: 'Thorin', color: '#c0703a' }],
};

/** Answers every call to the game function with `reply`, and keeps what was sent. */
function fakeBackend(reply: FunctionReply) {
  const calls: Record<string, unknown>[] = [];
  const backend: GameBackend = {
    fetchState: () => Promise.reject(new Error('not used')),
    watchState: () => () => undefined,
    callFunction: (body) => {
      calls.push(body);
      return Promise.resolve(reply);
    },
  };
  return { backend, calls };
}

describe('followJoinLink', () => {
  it('shows the join screen on a first visit', async () => {
    const { backend, calls } = fakeBackend({ status: 200, body: { ...preview, isMember: false } });
    const step = await followJoinLink(backend, TOKEN);
    expect(step).toEqual({ kind: 'choose', preview: { ...preview, isMember: false } });
    expect(calls).toEqual([{ action: 'join_preview', token: TOKEN }]);
  });

  it('opens the game for a member coming back', async () => {
    const { backend } = fakeBackend({ status: 200, body: { ...preview, isMember: true } });
    expect(await followJoinLink(backend, TOKEN)).toEqual({ kind: 'open', gameId: 'g1' });
  });

  it.each([
    { error: 'join_invalid', message: 'Este link de entrada não existe.' },
    { error: 'join_expired', message: 'Este link de entrada expirou. Peça um novo ao mestre.' },
  ])('explains a refused link ($error)', async ({ error, message }) => {
    const { backend } = fakeBackend({ status: 410, body: { error } });
    expect(await followJoinLink(backend, TOKEN)).toEqual({ kind: 'refused', message });
  });
});

describe('submitJoin', () => {
  const claim = { kind: 'claim', characterId: 'thorin' } as const;

  it('sends the choice and opens the game it joined', async () => {
    const { backend, calls } = fakeBackend({
      status: 200,
      body: { gameId: 'g1', characterId: 'thorin' },
    });
    expect(await submitJoin(backend, TOKEN, claim)).toEqual({ gameId: 'g1' });
    expect(calls).toEqual([{ action: 'join_game', token: TOKEN, choice: claim }]);
  });

  it('opens the game for someone who was already in it', async () => {
    const { backend } = fakeBackend({
      status: 409,
      body: { error: 'already_member', gameId: 'g1' },
    });
    expect(await submitJoin(backend, TOKEN, claim)).toEqual({ gameId: 'g1' });
  });

  it.each([
    {
      body: { error: 'character_taken' },
      message: 'Alguém acabou de assumir este personagem. Escolha outro.',
    },
    {
      body: { error: 'refused', reason: 'duplicate_name' },
      message: 'Já existe um personagem com esse nome na mesa.',
    },
  ])('explains a refusal ($body.error)', async ({ body, message }) => {
    const { backend } = fakeBackend({ status: 409, body });
    expect(await submitJoin(backend, TOKEN, claim)).toEqual({ message });
  });

  it('falls back to a generic message when the reply makes no sense', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { backend } = fakeBackend({ status: 500, body: null });
    expect(await submitJoin(backend, TOKEN, claim)).toEqual({
      message: 'Não foi possível entrar na mesa. Tente de novo.',
    });
    vi.restoreAllMocks();
  });
});

describe('signInWithGoogle', () => {
  it('comes back to the same URL, keeping the game and the entry link', async () => {
    const signInWithOAuth = vi.fn(() => Promise.resolve({ error: null }));
    const href = 'https://italoneri.github.io/Axis/?game=g1&join=abc';
    expect(await signInWithGoogle({ signInWithOAuth }, href)).toBe(true);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: href },
    });
  });

  it('reports a login that could not start', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const signInWithOAuth = () => Promise.resolve({ error: { message: 'provider disabled' } });
    expect(await signInWithGoogle({ signInWithOAuth }, 'https://x.example/')).toBe(false);
    vi.restoreAllMocks();
  });
});

describe('suggestionFrom', () => {
  it('takes the first name and the photo of the Google account', () => {
    const metadata = { full_name: 'Ana Souza', avatar_url: 'https://lh3.googleusercontent.com/a' };
    expect(suggestionFrom(metadata)).toEqual({
      name: 'Ana',
      portrait: 'https://lh3.googleusercontent.com/a',
    });
  });

  it('suggests nothing for an e-mail login', () => {
    expect(suggestionFrom({})).toEqual({ name: '' });
  });
});

describe('link URLs', () => {
  it('drops a one-time parameter, keeping the rest', () => {
    const url = new URL('https://mesa.example/axis/?invite=abc&game=g2#x');
    expect(withoutParam(url, 'invite')).toBe('https://mesa.example/axis/?game=g2#x');
  });

  it('points to the joined game without the entry link', () => {
    const url = new URL('https://mesa.example/axis/?join=abc');
    expect(gameUrl(url, 'g1')).toBe('https://mesa.example/axis/?game=g1');
  });
});
