/** Resolve Fish Audio public models (title / list) via api.fish.audio. */

export type FishVoiceModel = {
  id: string;
  title: string;
  description: string;
  languages: string[];
  tags: string[];
};

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
let listInflight: Promise<FishVoiceModel[]> | null = null;
let listCache: FishVoiceModel[] | null = null;

const STORAGE_PREFIX = 'pe-fish-voice-title:';

function rememberTitle(id: string, title: string): void {
  if (!id || !title) return;
  memoryCache.set(id, title);
  writeStored(id, title);
}

function normalizeModel(raw: Record<string, unknown>): FishVoiceModel | null {
  const id = typeof raw._id === 'string' ? raw._id.trim() : '';
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!id || !title) return null;
  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  const languages = Array.isArray(raw.languages)
    ? raw.languages.filter((value): value is string => typeof value === 'string')
    : [];
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((value): value is string => typeof value === 'string')
    : [];
  rememberTitle(id, title);
  return { id, title, description, languages, tags };
}

function readStored(voiceId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const value = sessionStorage.getItem(STORAGE_PREFIX + voiceId);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeStored(voiceId: string, title: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + voiceId, title);
  } catch {
    // quota / private mode — memory cache still helps
  }
}

export function peekFishVoiceTitle(voiceId: string): string | null {
  const id = voiceId.trim();
  if (!id) return null;
  return memoryCache.get(id) ?? readStored(id);
}

/**
 * Look up a Fish model title. Public models work without an API key.
 * Returns null when the model cannot be resolved.
 */
export async function fetchFishVoiceTitle(voiceId: string): Promise<string | null> {
  const id = voiceId.trim();
  if (!id) return null;

  const cached = peekFishVoiceTitle(id);
  if (cached) return cached;

  const existing = inflight.get(id);
  if (existing) return existing;

  const request = (async () => {
    try {
      const response = await fetch(`https://api.fish.audio/model/${encodeURIComponent(id)}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { title?: unknown };
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!title) return null;
      memoryCache.set(id, title);
      writeStored(id, title);
      return title;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, request);
  return request;
}

/** Reader chrome label: `Sarah — Fish Audio` */
export function formatFishVoiceLabel(voiceTitle: string | null | undefined, voiceId: string): string {
  const title = voiceTitle?.trim();
  if (title) return `${title} — Fish Audio`;
  const short = voiceId.trim();
  if (short.length > 12) return `Fish Audio (${short.slice(0, 8)}…)`;
  return short ? `Fish Audio (${short})` : 'Fish Audio';
}

/** Top public library voices (sorted by Fish “score”). Cached for the session. */
export async function listFishVoices(options?: {
  pageSize?: number;
  title?: string;
  force?: boolean;
}): Promise<FishVoiceModel[]> {
  const titleQuery = options?.title?.trim() ?? '';
  const pageSize = Math.min(100, Math.max(1, options?.pageSize ?? 40));

  // Only reuse the unfiltered browse cache.
  if (!titleQuery && !options?.force && listCache) {
    return listCache;
  }
  if (!titleQuery && !options?.force && listInflight) {
    return listInflight;
  }

  const params = new URLSearchParams({
    page_size: String(pageSize),
    page_number: '1',
    sort_by: 'score',
  });
  if (titleQuery) params.set('title', titleQuery);

  const request = (async () => {
    const response = await fetch(`https://api.fish.audio/model?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Fish voice list failed (${response.status}).`);
    }
    const data = (await response.json()) as { items?: unknown[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const models = items
      .map((item) => (
        item && typeof item === 'object'
          ? normalizeModel(item as Record<string, unknown>)
          : null
      ))
      .filter((item): item is FishVoiceModel => item !== null);
    if (!titleQuery) listCache = models;
    return models;
  })();

  if (!titleQuery) {
    listInflight = request.finally(() => {
      listInflight = null;
    });
    return listInflight;
  }
  return request;
}

/** Ensure a selected voice id is represented in a picker list. */
export async function ensureFishVoiceModel(
  voiceId: string,
  existing: FishVoiceModel[],
): Promise<FishVoiceModel[]> {
  const id = voiceId.trim();
  if (!id) return existing;
  if (existing.some((voice) => voice.id === id)) return existing;

  try {
    const response = await fetch(`https://api.fish.audio/model/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return [
        {
          id,
          title: peekFishVoiceTitle(id) || 'Custom voice',
          description: 'Selected reference ID',
          languages: [],
          tags: [],
        },
        ...existing,
      ];
    }
    const data = (await response.json()) as Record<string, unknown>;
    const model = normalizeModel(data);
    if (!model) return existing;
    return [model, ...existing];
  } catch {
    return [
      {
        id,
        title: peekFishVoiceTitle(id) || 'Custom voice',
        description: 'Selected reference ID',
        languages: [],
        tags: [],
      },
      ...existing,
    ];
  }
}
