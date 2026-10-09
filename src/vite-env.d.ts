/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: when unset, the master mode stays disabled. */
  readonly VITE_MASTER_PASSWORD?: string;
}

declare module 'virtual:building-art' {
  /** File names of the final building art in public/assets/buildings (`<id>.<shape>[.lvN].png`). */
  const files: readonly string[];
  export default files;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
