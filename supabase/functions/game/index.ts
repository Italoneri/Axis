// The `game` Edge Function. All logic lives in the bundle built from src/server
// (`npm run build:functions`); this file only wires it to supabase-js.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { serveGame } from '../_shared/game.js';

/** Every database or auth call gives up after this, so a stuck request never hangs the function. */
const REQUEST_TIMEOUT_MS = 10_000;

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

// Service role: bypasses RLS, so only this function writes. It never reaches the browser.
const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  },
});

Deno.serve((request) =>
  serveGame(request, {
    rpc: (fn, args) => supabase.rpc(fn, args),
    userFromToken: async (token) => {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? null : data.user.id;
    },
  }),
);
