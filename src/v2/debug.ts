/**
 * Opt-in debug logging via query param (or localStorage sticky flag).
 *
 * Enable:
 *   https://folioduet.dionlabs.ai/?debug=resume
 *   https://folioduet.dionlabs.ai/?debug=resume,hydrate,sync
 *   https://folioduet.dionlabs.ai/?debug=1          → all scopes below
 *
 * Sticky (survives dropping the query param until cleared):
 *   localStorage.setItem('pageecho-debug', 'resume')
 *   localStorage.removeItem('pageecho-debug')
 *
 * Scopes: resume | hydrate | sync | pack | all
 */

const STORAGE_KEY = 'pageecho-debug';

const ALL_SCOPES = ['resume', 'hydrate', 'sync', 'pack'] as const;

export type DebugScope = (typeof ALL_SCOPES)[number] | 'all' | '*';

/** Pure helper for tests / non-DOM use. */
export function parseDebugFlagsFromSearch(search: string): Set<string> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const raw = params.get('debug');
  if (!raw) return new Set();
  if (raw === '1' || raw === 'true' || raw === 'all') {
    return new Set(['all', ...ALL_SCOPES]);
  }
  return new Set(
    raw
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseDebugFlagsFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    if (raw === '1' || raw === 'true' || raw === 'all') {
      return new Set(['all', ...ALL_SCOPES]);
    }
    return new Set(
      raw
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

let cachedFlags: Set<string> | null = null;

function flags(): Set<string> {
  if (cachedFlags) return cachedFlags;
  const fromQuery = typeof window !== 'undefined'
    ? parseDebugFlagsFromSearch(window.location.search)
    : new Set<string>();
  const fromStorage = parseDebugFlagsFromStorage();
  cachedFlags = new Set([...fromQuery, ...fromStorage]);
  return cachedFlags;
}

/** Reset cache (tests / after toggling storage). */
export function resetDebugFlagCache(): void {
  cachedFlags = null;
}

export function isDebug(...scopes: Array<DebugScope | string>): boolean {
  const active = flags();
  if (active.size === 0) return false;
  if (active.has('all') || active.has('*')) return true;
  return scopes.some((scope) => active.has(scope));
}

function serializeDebugData(data: unknown): string {
  try {
    return JSON.stringify(data, (_key, value) => {
      if (value === undefined) return '(undefined)';
      if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
      return value;
    });
  } catch {
    return String(data);
  }
}

export function debugLog(
  scope: DebugScope | string,
  message: string,
  data?: unknown,
): void {
  if (!isDebug(scope)) return;
  const prefix = `[FolioDuet:${scope}]`;
  if (data !== undefined) {
    // Single string so Chrome copy/paste keeps fields (no collapsed Objects).
    console.info(`${prefix} ${message} ${serializeDebugData(data)}`);
  } else {
    console.info(prefix, message);
  }
}
