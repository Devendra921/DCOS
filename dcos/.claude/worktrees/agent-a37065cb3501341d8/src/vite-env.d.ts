/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Override the app chrome (sidebar + header) visibility.
   *
   * Defaults:
   *   dev          → shown (unless set to "false")
   *   production   → hidden (unless set to "true")
   *
   * When hidden, only routed page content is rendered for embedding in a
   * host shell that provides its own navigation.
   */
  readonly VITE_SHOW_CHROME?: 'true' | 'false';

  /**
   * Controls the size of the in-memory mock dataset seeded at app start.
   *
   *   "small"  → ~5K sites · seeds in <1s · fast reload, smaller memory.
   *              Default for `npm run dev` so every reload is snappy.
   *   "medium" → ~20K sites · seeds in ~2-3s · realistic-feel demo.
   *   "full"   → ~62.5K sites · seeds in ~6-10s · Tier-1-operator scale.
   *              Use for stress-testing performance / demos that need the
   *              full numbers ("50K live sites").
   *
   * Default: `"small"` when unset.
   */
  readonly VITE_SEED_SCALE?: 'small' | 'medium' | 'full';

  /**
   * How MockDB is populated at startup.
   *
   *   "json"    — load pre-built files from public/mock-db/<profile>/ (default)
   *   "runtime" — generate with Faker on each page load
   */
  readonly VITE_MOCK_DB_SOURCE?: 'json' | 'runtime';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
