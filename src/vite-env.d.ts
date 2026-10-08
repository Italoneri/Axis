/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional: when unset, the master mode stays disabled. */
  readonly VITE_MASTER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
