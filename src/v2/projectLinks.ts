/** Public project links — override via Vite env when the repo name changes. */
export const GITHUB_REPO_URL =
  import.meta.env.VITE_GITHUB_REPO_URL?.trim()
  || 'https://github.com/dion-labs/pageecho';

export const GITHUB_SPONSORS_URL =
  import.meta.env.VITE_GITHUB_SPONSORS_URL?.trim()
  || 'https://github.com/sponsors/dion-labs';
