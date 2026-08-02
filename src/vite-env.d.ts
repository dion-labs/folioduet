/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
  readonly VITE_FISH_AUDIO_SPONSOR_KEY?: string;
  readonly VITE_GITHUB_REPO_URL?: string;
  readonly VITE_GITHUB_SPONSORS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
