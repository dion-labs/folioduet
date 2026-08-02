/** Resolve Fish Audio reference_id → public model title. */

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

const STORAGE_PREFIX = 'pe-fish-voice-title:';

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
