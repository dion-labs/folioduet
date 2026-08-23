/** Public project links — override via Vite env when the repo name changes. */
export const GITHUB_REPO_URL =
  import.meta.env.VITE_GITHUB_REPO_URL?.trim()
  || 'https://github.com/dion-labs/folioduet';

export const GITHUB_SPONSORS_URL =
  import.meta.env.VITE_GITHUB_SPONSORS_URL?.trim()
  || 'https://github.com/sponsors/dion-labs';

/** Fish Audio signup / referral — shown quietly under the BYOK key field. */
export const FISH_AUDIO_REFERRAL_URL =
  import.meta.env.VITE_FISH_AUDIO_REFERRAL_URL?.trim()
  || 'https://fish.audio/?aff=TTQTPBHXZXG3O';
