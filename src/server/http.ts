import { rpcGameDb, type RpcClient } from './gameDb';
import { handleGameRequest, type AuthPort } from './handler';
import { serverCatalog } from './catalog';

/** What supabase/functions/game/index.ts hands over: thin wrappers around supabase-js. */
export interface GameFunctionDeps extends RpcClient, AuthPort {}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Request → Response for the `game` Edge Function, with CORS and one structured log line per call. */
export async function serveGame(request: Request, deps: GameFunctionDeps): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const started = Date.now();
  const body = await readJson(request);
  const operation = actionOf(body);
  try {
    const response = await handleGameRequest(
      { authorization: request.headers.get('Authorization'), body },
      { auth: deps, db: rpcGameDb(deps), catalog: serverCatalog },
    );
    log('info', { operation, status: response.status, durationMs: Date.now() - started });
    return json(response.status, response.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log('error', { operation, status: 500, durationMs: Date.now() - started, message });
    return json(500, { error: 'internal' });
  }
}

/** A body that is not JSON reaches the handler as null and gets its 422. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    log('warn', { operation: 'read_body', message: String(error) });
    return null;
  }
}

function actionOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'action' in body) return String(body.action);
  return 'unknown';
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function log(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>): void {
  console[level](JSON.stringify({ level, fn: 'game', ...fields }));
}
