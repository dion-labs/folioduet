import { useEffect, useRef } from 'react';

export type MediaSessionPlayback = 'none' | 'paused' | 'playing';

export type MediaSessionHandlers = {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export type MediaSessionMeta = {
  title: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
};

/** Map app TTS state onto Media Session playbackState. */
export function toMediaSessionPlayback(
  state: 'idle' | 'buffering' | 'playing' | 'paused',
): MediaSessionPlayback {
  if (state === 'idle') return 'none';
  if (state === 'paused') return 'paused';
  return 'playing';
}

function artworkEntries(url: string | undefined): MediaImage[] {
  if (!url) return [];
  return [
    { src: url, sizes: '512x512', type: 'image/png' },
    { src: url, sizes: '192x192', type: 'image/png' },
  ];
}

/**
 * Keep the OS media notification / lock-screen controls in sync with TTS.
 * No-ops when Media Session API is unavailable.
 */
export function useMediaSession(options: {
  enabled: boolean;
  playbackState: MediaSessionPlayback;
  meta: MediaSessionMeta;
  handlers: MediaSessionHandlers;
}) {
  const { enabled, playbackState, meta, handlers } = options;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) {
      return undefined;
    }

    const session = navigator.mediaSession;

    const bind = (action: MediaSessionAction, handler: (() => void) | undefined) => {
      try {
        session.setActionHandler(action, handler
          ? () => {
              handler();
            }
          : null);
      } catch {
        // Older browsers reject unsupported actions.
      }
    };

    bind('play', () => handlersRef.current.onPlay());
    bind('pause', () => handlersRef.current.onPause());
    bind('stop', () => handlersRef.current.onStop());
    bind('previoustrack', handlersRef.current.onPrevious
      ? () => handlersRef.current.onPrevious?.()
      : undefined);
    bind('nexttrack', handlersRef.current.onNext
      ? () => handlersRef.current.onNext?.()
      : undefined);

    return () => {
      bind('play', undefined);
      bind('pause', undefined);
      bind('stop', undefined);
      bind('previoustrack', undefined);
      bind('nexttrack', undefined);
      try {
        session.playbackState = 'none';
        session.metadata = null;
      } catch {
        // ignore
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    try {
      session.metadata = new MediaMetadata({
        title: meta.title || 'FolioDuet',
        artist: meta.artist || 'FolioDuet',
        album: meta.album || 'Reading',
        artwork: artworkEntries(meta.artworkUrl),
      });
    } catch {
      // MediaMetadata missing or rejected — still keep action handlers.
    }
  }, [enabled, meta.title, meta.artist, meta.album, meta.artworkUrl]);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = playbackState;
    } catch {
      // ignore
    }
  }, [enabled, playbackState]);
}
