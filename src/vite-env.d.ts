/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: when unset, the master mode stays disabled. */
  readonly VITE_MASTER_PASSWORD?: string;
  /** Both set: the game runs online (Supabase). Either missing: offline, as before. */
  readonly VITE_SUPABASE_URL?: string;
  /** The public anon key. Never the service role key: everything VITE_ ships to the browser. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

declare module 'virtual:building-art' {
  /** File names of the final building art in public/assets/buildings (`<id>.<shape>[.lvN].png`). */
  const files: readonly string[];
  export default files;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
