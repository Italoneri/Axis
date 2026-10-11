// No imports on purpose: main.ts reads this offline too, without pulling in supabase-js.

export interface OnlineConfig {
  url: string;
  anonKey: string;
}

/** Null keeps the game offline: both variables are needed to go online. */
export function onlineConfig(env: {
  VITE_SUPABASE_URL?: string | undefined;
  VITE_SUPABASE_ANON_KEY?: string | undefined;
}): OnlineConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}
