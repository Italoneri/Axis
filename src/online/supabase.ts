import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OnlineConfig } from './config';
import type { ArchiveBackend, ArchiveTable, ArchiveWriteResult } from './SupabaseArchiveRepository';
import type { FunctionReply, GameBackend } from './SupabaseRepository';
import { ARCHIVE_IMAGE_BUCKET, type ImageBucket } from './SupabaseImageStore';

/** Every request to Supabase gives up after this, so a dead network never freezes the game. */
const REQUEST_TIMEOUT_MS = 15_000;
/** Archive images (up to 2 MB each way) get longer, for slow connections. */
const STORAGE_TIMEOUT_MS = 60_000;

export function createSupabase({ url, anonKey }: OnlineConfig): SupabaseClient {
  return createClient(url, anonKey, {
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutFor(input)) }),
    },
  });
}

function timeoutFor(input: RequestInfo | URL): number {
  const target = input instanceof Request ? input.url : String(input);
  return target.includes('/storage/v1/') ? STORAGE_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

/** The private bucket of archive images; the Storage policies apply the note's rules. */
export function supabaseImageBucket(client: SupabaseClient): ImageBucket {
  const bucket = () => client.storage.from(ARCHIVE_IMAGE_BUCKET);
  return {
    upload: async (path, blob, contentType) => {
      const { error } = await bucket().upload(path, blob, { contentType, upsert: true });
      if (error) throw new Error(`upload archive image: ${error.message}`);
    },
    signedUrl: async (path, seconds) => {
      const { data, error } = await bucket().createSignedUrl(path, seconds);
      if (error) throw new Error(`sign archive image: ${error.message}`);
      return data.signedUrl;
    },
    download: async (path) => {
      const { data, error } = await bucket().download(path);
      if (!error) return data;
      // A missing (or forbidden) file leaves its note without the picture; anything else fails.
      if (/not.?found|400|404/i.test(error.message)) return null;
      throw new Error(`download archive image: ${error.message}`);
    },
    remove: async (paths) => {
      const { error } = await bucket().remove([...paths]);
      if (error) throw new Error(`remove archive images: ${error.message}`);
    },
  };
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

const ARCHIVE_TABLES = ['archive_topics', 'archive_notes'] as const;
const ARCHIVE_PAGE_SIZE = 1000;
/** 20 000 records per table is far beyond any campaign; past it, loading stops instead of looping on. */
const ARCHIVE_MAX_PAGES = 20;

const archiveEventSchema = z.object({
  eventType: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  new: z.record(z.string(), z.unknown()),
  old: z.record(z.string(), z.unknown()),
});

export function supabaseArchiveBackend(client: SupabaseClient): ArchiveBackend {
  const fetchTable = async (table: ArchiveTable, gameId: string): Promise<unknown[]> => {
    const rows: unknown[] = [];
    for (let page = 0; page < ARCHIVE_MAX_PAGES; page++) {
      const from = page * ARCHIVE_PAGE_SIZE;
      const { data, error } = await client
        .from(table)
        .select('*')
        .eq('game_id', gameId)
        .order('id')
        .range(from, from + ARCHIVE_PAGE_SIZE - 1);
      if (error) throw new Error(`load ${table}: ${error.message}`);
      rows.push(...data);
      if (data.length < ARCHIVE_PAGE_SIZE) return rows;
    }
    console.warn('[archive] stopped loading at the page limit', { table, rows: rows.length });
    return rows;
  };

  return {
    fetchRows: async (gameId) => {
      const [topics, notes] = await Promise.all(
        ARCHIVE_TABLES.map((table) => fetchTable(table, gameId)),
      );
      return { topics: topics ?? [], notes: notes ?? [] };
    },

    writeRows: async (gameId, change) => {
      const withGame = (rows: readonly object[]) =>
        rows.map((row) => ({ ...row, game_id: gameId }));
      // Topics before their notes go in; notes before their topics go away.
      const steps = [
        change.topics.length > 0 &&
          (() =>
            client
              .from('archive_topics')
              .upsert(withGame(change.topics), { onConflict: 'game_id,id' })),
        change.notes.length > 0 &&
          (() =>
            client
              .from('archive_notes')
              .upsert(withGame(change.notes), { onConflict: 'game_id,id' })),
        change.removedNoteIds.length > 0 &&
          (() =>
            client
              .from('archive_notes')
              .delete()
              .eq('game_id', gameId)
              .in('id', change.removedNoteIds)),
        change.removedTopicIds.length > 0 &&
          (() =>
            client
              .from('archive_topics')
              .delete()
              .eq('game_id', gameId)
              .in('id', change.removedTopicIds)),
      ];
      for (const step of steps) {
        if (!step) continue;
        const { error } = await step();
        if (error) return archiveRefusal(error, 'write archive');
      }
      return { ok: true };
    },

    replaceRows: async (gameId, rows) => {
      const { error } = await client.rpc('replace_archive', {
        target_game: gameId,
        topics: rows.topics,
        notes: rows.notes,
      });
      return error ? archiveRefusal(error, 'replace archive') : { ok: true };
    },

    watch: (gameId, onEvent) => {
      const handle = (table: ArchiveTable) => (payload: unknown) => {
        const event = archiveEventSchema.safeParse(payload);
        if (!event.success) {
          console.warn('[archive] unexpected realtime payload', event.error.message);
          return;
        }
        const { eventType, new: row, old } = event.data;
        if (eventType !== 'DELETE') return onEvent({ table, kind: 'upsert', row });
        if (typeof old.id === 'string') onEvent({ table, kind: 'delete', id: old.id });
      };
      // Deletes only carry the key, so the game filter cannot apply to them: ids are random.
      const channel = ARCHIVE_TABLES.reduce(
        (built, table) =>
          built
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table, filter: `game_id=eq.${gameId}` },
              handle(table),
            )
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, handle(table)),
        client.channel(`archive:${gameId}`),
      ).subscribe();
      return () => void client.removeChannel(channel);
    },
  };
}

/** RLS (42501) and the empty-topic trigger are refusals; anything else is a failure. */
function archiveRefusal(
  error: { code?: string; message: string },
  operation: string,
): ArchiveWriteResult {
  if (error.code === '42501') return { ok: false, error: 'forbidden' };
  if (error.message.includes('category_not_empty'))
    return { ok: false, error: 'category_not_empty' };
  throw new Error(`${operation}: ${error.message}`);
}
