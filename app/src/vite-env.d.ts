/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public base URL (Cloudflare R2 / static host) for packs + manifest.json. */
  readonly VITE_MANIFEST_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
