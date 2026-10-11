import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OnlineConfig } from './config';
import type { FunctionReply, GameBackend } from './SupabaseRepository';

/** Every request to Supabase gives up after this, so a dead network never freezes the game. */
const REQUEST_TIMEOUT_MS = 15_000;

export function createSupabase({ url, anonKey }: OnlineConfig): SupabaseClient {
  return createClient(url, anonKey, {
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
}

const stateRowSchema = z.object({ state: z.unknown() });
const realtimeRowSchema = z.object({ new: z.object({ state: z.unknown() }) });

export function supabaseBackend(client: SupabaseClient, config: OnlineConfig): GameBackend {
  return {
    fetchState: async (gameId) => {
      const { data, error } = await client.from('games').select('state').eq('id', gameId).single();
      if (error) throw new Error(`load game: ${error.message}`);
      return stateRowSchema.parse(data).state;
    },

    callFunction: async (body) => {
      const { data } = await client.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return { status: 401, body: { error: 'unauthorized' } };
      const response = await fetch(`${config.url}/functions/v1/game`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: config.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      return readReply(response);
    },

    watchState: (gameId, onState) => {
      const channel = client
        .channel(`game:${gameId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
          (payload: unknown) => {
            const row = realtimeRowSchema.safeParse(payload);
            if (row.success) onState(row.data.new.state);
            else console.warn('[online] unexpected realtime payload', row.error.message);
          },
        )
        .subscribe();
      return () => void client.removeChannel(channel);
    },
  };
}

async function readReply(response: Response): Promise<FunctionReply> {
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch (error) {
    console.warn('[online] function answered non-JSON', { status: response.status, error });
    return { status: response.status, body: { error: 'non_json', text: text.slice(0, 200) } };
  }
}
