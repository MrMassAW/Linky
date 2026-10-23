/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_R2_ENABLED?: string;
  readonly VITE_FIREBASE_CONFIG?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_HASH_ROUTER?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
