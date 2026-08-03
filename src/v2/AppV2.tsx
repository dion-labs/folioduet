import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  Heart,
  Link2,
  ListTree,
  LoaderCircle,
  Menu,
  Pause,
  Play,
  Plus,
  Settings,
  Smartphone,
  Square,
  Upload,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { MarkdownBlock } from '../hooks/useTTS';
import {
  findPageForStreamIndex,
  hasTrustedPageStarts,
  shouldPreferPageResume,
  streamPageToMarkdownBlocks,
} from './bookStream';
import {
  buildChapterIndex,
  findCurrentChapterIndex,
  locateChaptersOnPages,
} from './chapters';
import {
  buildBookStream,
  calculateProgress,
  extractMarkdownPages,
  loadMarkdownBook,
  loadMarkdownStream,
  type BookStreamBlock,
} from './documents';
import { ChapterListPanel } from './components/ChapterListPanel';
import { ConsentBanner } from './components/ConsentBanner';
import { GitHubMark } from './components/GitHubMark';
import { HandoffDialog } from './components/HandoffDialog';
import { HandoffResumeDialog } from './components/HandoffResumeDialog';
import { ImportDialog } from './components/ImportDialog';
import { LegalDialog } from './components/LegalDialog';
import { LibrarySidebar } from './components/LibrarySidebar';
import { LoginGate } from './components/LoginGate';
import { ReaderWords } from './components/ReaderWords';
import { SettingsPanel } from './components/SettingsPanel';
import { parseLegalHash, type LegalDocId } from './legal';
import {
  buildHandoffUrl,
  clearHandoffFromUrl,
  clearPendingHandoff,
  loadPendingHandoff,
  readHandoffFromLocation,
  resolveHandoffStreamIndex,
  savePendingHandoff,
  type HandoffTarget,
} from './handoff';
import { GITHUB_REPO_URL, GITHUB_SPONSORS_URL } from './projectLinks';
import {
  TELL_TALE_DEFAULT_AUDIO_PROVIDER,
  TELL_TALE_DEFAULT_AUDIO_VOICE_ID,
  TELL_TALE_LIBRARY_DOC_ID,
  TELL_TALE_SAMPLE_ID,
  createTellTaleLibraryDocument,
  isCatalogSampleDocumentId,
} from './catalog/constants';
import { installGlobalErrorReporting } from './firebase/analytics';
import { isFirebaseConfigured } from './firebase/app';
import {
  completeGoogleRedirectIfPresent,
  ensureAnonymousSession,
  signInWithGoogle,
  signOutUser,
  subscribeAuth,
  waitForAuthReady,
} from './firebase/auth';
import { clearFirebaseAuthHandlerUrl } from './firebase/authUrl';
import { readFishSponsorKey } from './firebase/config';
import { fetchFishVoiceTitle, formatFishVoiceLabel, peekFishVoiceTitle } from './fishVoice';
import {
  ensureCatalogSamplePages,
  fetchCatalogAudioClips,
  fetchCatalogSamplePages,
  publishCatalogAudioClip,
} from './firebase/catalog';
import { useViewportBookPages } from './useViewportBookPages';

const BimodalPDFViewer = lazy(async () => {
  const module = await import('../components/BimodalPDFViewer');
  return { default: module.BimodalPDFViewer };
});
import {
  createDocumentId,
  deleteDocumentFiles,
  loadActiveDocumentId,
  loadLibrary,
  loadPairedPdf,
  loadPreferences,
  loadSourceFile,
  peekBootActiveDocumentId,
  resolveActiveDocumentId,
  saveActiveDocumentId,
  saveLibrary,
  savePairedPdf,
  savePreferences,
  saveSourceFile,
} from './storage';
import {
  deleteSyncedDocument,
  downloadDocumentBlob,
  fetchBootstrap,
  loadProcessedPages,
  putActiveDocumentId,
  putDocumentProgress,
  putLibrary,
  putPreferences,
  putSecrets,
  readSecrets,
  setSyncAuthUid,
  syncProcessedPages,
  toSyncedPreferences,
  uploadDocumentBlob,
  usesFirebaseSync,
} from './syncClient';
import type {
  DeviceSyncStatus,
  LibraryDocument,
  PageContent,
  ReaderView,
  TtsServerStatus,
} from './types';
import { useContinuousTTS } from './useContinuousTTS';
import { useMediaSession, toMediaSessionPlayback } from './useMediaSession';
import { useMobileFocusChrome } from './useMobileFocusChrome';
import { debugLog, isDebug, resetDebugFlagCache } from './debug';
import './styles.css';

type PageChangeSource = 'manual' | 'automatic';

interface PendingProgress {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
  /** Null when pageStarts are not trusted yet — do not persist / poison stream. */
  streamIndex: number | null;
}

function clampPage(pageIndex: number, totalPages: number): number {
  return Math.min(Math.max(0, pageIndex), Math.max(0, totalPages - 1));
}

function createLibraryDocument(file: File, totalPages: number): LibraryDocument {
  const now = Date.now();
  const isZip = file.name.toLowerCase().endsWith('.zip');
  return {
    id: createDocumentId(),
    name: file.name.replace(/\.(pdf|zip)$/i, ''),
    kind: isZip ? 'markdown-zip' : 'pdf',
    sourceName: file.name,
    totalPages: Math.max(1, totalPages),
    currentPageIndex: 0,
    activeBlockIndex: 0,
    activeWordIndex: 0,
    updatedAt: now,
    addedAt: now,
  };
}

/** Collapse legacy per-user sample copies onto the shared catalog stub id. */
function normalizeLibraryDocuments(documents: LibraryDocument[]): LibraryDocument[] {
  const byId = new Map<string, LibraryDocument>();
  for (const document of documents) {
    if (document.isSample || document.catalogSampleId === TELL_TALE_SAMPLE_ID) {
      const prior = byId.get(TELL_TALE_LIBRARY_DOC_ID);
      const stub: LibraryDocument = {
        ...(prior ?? document),
        ...document,
        id: TELL_TALE_LIBRARY_DOC_ID,
        name: 'The Tell-Tale Heart',
        kind: 'markdown-zip',
        sourceName: document.sourceName || 'The Tell-Tale Heart.zip',
        isSample: true,
        catalogSampleId: TELL_TALE_SAMPLE_ID,
        hasProcessedContent: true,
        processedFormat: 'markdown-pages',
        currentPageIndex: Math.max(
          prior?.currentPageIndex ?? 0,
          document.currentPageIndex ?? 0,
        ),
        // Keep progress fields from the further-ahead copy.
        activeBlockIndex: (
          (document.currentPageIndex ?? 0) >= (prior?.currentPageIndex ?? 0)
            ? document
            : prior ?? document
        ).activeBlockIndex,
        activeWordIndex: (
          (document.currentPageIndex ?? 0) >= (prior?.currentPageIndex ?? 0)
            ? document
            : prior ?? document
        ).activeWordIndex,
        activeStreamIndex: (
          (document.currentPageIndex ?? 0) >= (prior?.currentPageIndex ?? 0)
            ? document
            : prior ?? document
        ).activeStreamIndex,
        updatedAt: Math.max(prior?.updatedAt ?? 0, document.updatedAt ?? 0),
        addedAt: Math.min(prior?.addedAt ?? document.addedAt, document.addedAt),
      };
      byId.set(TELL_TALE_LIBRARY_DOC_ID, stub);
      continue;
    }
    byId.set(document.id, document);
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function mergeLibraryDocuments(
  primary: LibraryDocument[],
  secondary: LibraryDocument[],
): LibraryDocument[] {
  const byId = new Map<string, LibraryDocument>();
  for (const document of [...secondary, ...primary]) {
    const prior = byId.get(document.id);
    if (!prior) {
      byId.set(document.id, document);
      continue;
    }
    // Prefer newer metadata, but never discard further-ahead reading progress
    // (cloud can lag or get poisoned to page 0 while localStorage is correct).
    const newer = document.updatedAt >= prior.updatedAt ? document : prior;
    const progressSource = (document.currentPageIndex ?? 0) > (prior.currentPageIndex ?? 0)
      ? document
      : (prior.currentPageIndex ?? 0) > (document.currentPageIndex ?? 0)
        ? prior
        : newer;
    byId.set(document.id, {
      ...newer,
      currentPageIndex: progressSource.currentPageIndex,
      activeBlockIndex: progressSource.activeBlockIndex,
      activeWordIndex: progressSource.activeWordIndex,
      activeStreamIndex: progressSource.activeStreamIndex,
      totalPages: Math.max(
        newer.totalPages ?? 1,
        prior.totalPages ?? 1,
        (progressSource.currentPageIndex ?? 0) + 1,
      ),
      updatedAt: Math.max(newer.updatedAt ?? 0, prior.updatedAt ?? 0),
    });
  }
  return normalizeLibraryDocuments(Array.from(byId.values()));
}

const firebaseMode = isFirebaseConfigured();

export default function AppV2() {
  const [authUser, setAuthUser] = useState<User | null | undefined>(
    firebaseMode ? undefined : null,
  );
  const [authBootError, setAuthBootError] = useState<string | null>(null);
  // In Firebase mode, never paint a previous account's shelf before bootstrap.
  // Freeze last-open id before auth effects can clear localStorage.
  const bootActiveDocumentIdRef = useRef<string | null>(
    firebaseMode ? peekBootActiveDocumentId() : loadActiveDocumentId(),
  );
  const [documents, setDocuments] = useState<LibraryDocument[]>(() => (
    firebaseMode ? [] : normalizeLibraryDocuments(loadLibrary())
  ));
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(() => {
    if (firebaseMode) return null;
    const active = loadActiveDocumentId();
    if (!active) return null;
    const library = normalizeLibraryDocuments(loadLibrary());
    if (library.some((document) => document.id === active)) return active;
    const legacySample = loadLibrary().find((document) => document.id === active && document.isSample);
    return legacySample ? TELL_TALE_LIBRARY_DOC_ID : active;
  });
  const pendingLibraryMergeRef = useRef<LibraryDocument[] | null>(null);
  const lastAuthUidRef = useRef<string | null>(null);
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;

  const [pageIndex, setPageIndex] = useState(() => activeDocument?.currentPageIndex ?? 0);
  const [savedBlockIndex, setSavedBlockIndex] = useState(() => activeDocument?.activeBlockIndex ?? 0);
  const [savedWordIndex, setSavedWordIndex] = useState(() => activeDocument?.activeWordIndex ?? 0);
  const [readerView, setReaderView] = useState<ReaderView>('reading');
  const [pageContent, setPageContent] = useState<PageContent>({ pageIndex: -1, blocks: [] });
  const [nextPageContent, setNextPageContent] = useState<PageContent>({ pageIndex: -1, blocks: [] });
  const [markdownBlocks, setMarkdownBlocks] = useState<MarkdownBlock[]>([]);
  /** Last fully painted page — kept on screen while the next page prepares. */
  const [paintedPage, setPaintedPage] = useState<{
    pageIndex: number;
    blocks: string[];
    markdownBlocks: MarkdownBlock[];
  } | null>(null);
  const [pageTurnDir, setPageTurnDir] = useState<-1 | 0 | 1>(0);
  const paintedPageIndexRef = useRef<number | null>(null);
  /** Live reading-page count for TTS auto-advance (viewport pack can lead library totalPages). */
  const [readerPageCount, setReaderPageCount] = useState(() => Math.max(1, activeDocument?.totalPages ?? 1));
  const [bookStream, setBookStream] = useState<BookStreamBlock[] | null>(null);
  const [source, setSource] = useState<File | string | null>(null);
  const [pairedPdf, setPairedPdf] = useState<File | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState(loadPreferences);
  const [deviceSyncStatus, setDeviceSyncStatus] = useState<DeviceSyncStatus>('idle');
  const [inworldServerStatus, setInworldServerStatus] = useState<TtsServerStatus>('checking');
  const [fishAudioServerStatus, setFishAudioServerStatus] = useState<TtsServerStatus>('checking');
  const [ttsSecrets, setTtsSecrets] = useState({ inworldApiKey: '', fishAudioApiKey: '' });
  const [fishVoiceTitle, setFishVoiceTitle] = useState<string | null>(() => (
    peekFishVoiceTitle(loadPreferences().fishAudioVoiceId)
  ));
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(() => firebaseMode || !loadActiveDocumentId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [hydrateReady, setHydrateReady] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffUrl, setHandoffUrl] = useState('');
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffResume, setHandoffResume] = useState<HandoffTarget | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(() => (
    typeof window === 'undefined' ? null : parseLegalHash(window.location.hash)
  ));

  const pageChangeRef = useRef<(nextPage: number, source: PageChangeSource) => void>(() => undefined);
  const pendingProgressRef = useRef<PendingProgress | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const pendingHandoffRef = useRef<HandoffTarget | null>(null);
  const handoffArrivalRef = useRef<'url' | 'storage' | null>(null);
  const handoffBootstrappedRef = useRef(false);
  const handoffResumeShownRef = useRef(false);
  if (!handoffBootstrappedRef.current) {
    handoffBootstrappedRef.current = true;
    const fromUrl = readHandoffFromLocation();
    if (fromUrl) {
      savePendingHandoff(fromUrl);
      pendingHandoffRef.current = fromUrl;
      handoffArrivalRef.current = 'url';
    } else {
      const stored = loadPendingHandoff();
      pendingHandoffRef.current = stored;
      handoffArrivalRef.current = stored ? 'storage' : null;
    }
  }
  const skipNextLibraryPushRef = useRef(true);
  const skipNextPreferencesPushRef = useRef(true);
  const readerStageRef = useRef<HTMLElement | null>(null);
  const pageBodyRef = useRef<HTMLDivElement | null>(null);
  const streamAnchorRef = useRef({ streamIndex: 0, wordIndex: 0 });
  /** Document id the current streamAnchorRef belongs to — avoids clobbering handoff restores. */
  const streamAnchorDocIdRef = useRef<string | null>(null);
  /** One-shot legacy page restore when `activeStreamIndex` is missing/poisoned. */
  const pageAnchorRef = useRef<{ pageIndex: number; blockIndex: number; wordIndex: number } | null>(null);
  const pageStartsRef = useRef<number[]>([0]);
  /** After a page-anchor resume, write the healed stream index once pack settles. */
  const needsStreamHealRef = useRef(false);

  const updateDocument = useCallback((documentId: string, patch: Partial<LibraryDocument>) => {
    setDocuments((current) => current.map((document) => (
      document.id === documentId ? { ...document, ...patch } : document
    )));
  }, []);

  const persistDocumentProgress = useCallback((
    documentId: string,
    progress: {
      currentPageIndex: number;
      activeBlockIndex: number;
      activeWordIndex: number;
      activeStreamIndex?: number | null;
    },
  ) => {
    const updatedAt = Date.now();
    const streamTrusted = typeof progress.activeStreamIndex === 'number'
      && Number.isFinite(progress.activeStreamIndex);
    // Never write `activeStreamIndex: undefined` into state — Firestore rejects
    // undefined on the next full-library sync and progress/totalPages can stall.
    setDocuments((current) => current.map((document) => {
      if (document.id !== documentId) return document;
      const next: LibraryDocument = {
        ...document,
        currentPageIndex: progress.currentPageIndex,
        activeBlockIndex: progress.activeBlockIndex,
        activeWordIndex: progress.activeWordIndex,
        updatedAt,
        totalPages: Math.max(document.totalPages ?? 1, progress.currentPageIndex + 1),
      };
      if (streamTrusted) {
        next.activeStreamIndex = progress.activeStreamIndex!;
      } else {
        delete next.activeStreamIndex;
      }
      return next;
    }));
    debugLog('resume', 'persistDocumentProgress', {
      documentId,
      ...progress,
      streamTrusted,
    });
    void putDocumentProgress(documentId, {
      currentPageIndex: progress.currentPageIndex,
      activeBlockIndex: progress.activeBlockIndex,
      activeWordIndex: progress.activeWordIndex,
      ...(streamTrusted ? { activeStreamIndex: progress.activeStreamIndex! } : {}),
    }).then(() => {
      debugLog('sync', 'putDocumentProgress ok', {
        documentId,
        currentPageIndex: progress.currentPageIndex,
        activeStreamIndex: streamTrusted ? progress.activeStreamIndex : '(cleared)',
      });
    }).catch((error) => {
      debugLog('sync', 'putDocumentProgress FAILED', {
        documentId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (isDebug('sync', 'resume')) {
        console.warn('[PageEcho:sync] putDocumentProgress failed', error);
      }
    });
  }, []);

  const flushProgress = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const progress = pendingProgressRef.current;
    if (!progress) return;
    pendingProgressRef.current = null;
    persistDocumentProgress(progress.documentId, {
      currentPageIndex: progress.pageIndex,
      activeBlockIndex: progress.blockIndex,
      activeWordIndex: progress.wordIndex,
      activeStreamIndex: progress.streamIndex,
    });
  }, [persistDocumentProgress]);

  const queueProgress = useCallback((blockIndex: number, wordIndex: number) => {
    if (!activeDocumentId) return;
    setSavedBlockIndex(blockIndex);
    setSavedWordIndex(wordIndex);
    const trusted = hasTrustedPageStarts(pageStartsRef.current, pageIndex);
    const streamIndex = trusted
      ? (pageStartsRef.current[pageIndex] ?? 0) + blockIndex
      : null;
    if (streamIndex !== null) {
      streamAnchorRef.current = { streamIndex, wordIndex };
    } else {
      streamAnchorRef.current = { ...streamAnchorRef.current, wordIndex };
    }
    pendingProgressRef.current = {
      documentId: activeDocumentId,
      pageIndex,
      blockIndex,
      wordIndex,
      streamIndex,
    };
    if (progressTimerRef.current === null) {
      progressTimerRef.current = window.setTimeout(flushProgress, 450);
    }
  }, [activeDocumentId, flushProgress, pageIndex]);

  const activeCatalogSampleId = activeDocument?.catalogSampleId
    ?? (activeDocument?.isSample ? TELL_TALE_SAMPLE_ID : undefined);

  const ttsConfig = useMemo(() => {
    const usingDefaultSharedVoice = Boolean(
      activeCatalogSampleId
      && preferences.fishAudioEnabled
      && preferences.fishAudioVoiceId === TELL_TALE_DEFAULT_AUDIO_VOICE_ID,
    );
    return {
      rate: preferences.playbackRate,
      volume: preferences.volume,
      inworldEnabled: preferences.inworldEnabled || preferences.fishAudioEnabled,
      inworldEndpoint: '/api/tts/synthesize',
      inworldApiKey: ttsSecrets.inworldApiKey || undefined,
      inworldVoiceId: preferences.inworldVoiceId,
      provider: preferences.fishAudioEnabled ? ('fish-audio' as const) : ('inworld' as const),
      fishAudioVoiceId: preferences.fishAudioVoiceId,
      // Sponsor key lives on the Pages Function / local Node server; pass BYOK only.
      fishAudioApiKey: ttsSecrets.fishAudioApiKey || undefined,
      onAudioFetched: usingDefaultSharedVoice
        ? (clip: {
          text: string;
          provider: string;
          voiceId: string;
          audioContent: string;
          timestampInfo?: unknown;
        }) => {
          if (!activeCatalogSampleId) return;
          if (clip.provider !== TELL_TALE_DEFAULT_AUDIO_PROVIDER) return;
          if (clip.voiceId !== TELL_TALE_DEFAULT_AUDIO_VOICE_ID) return;
          void publishCatalogAudioClip(activeCatalogSampleId, {
            text: clip.text,
            provider: clip.provider,
            voiceId: clip.voiceId,
            mime: 'audio/mpeg',
            audioContent: clip.audioContent,
            timestampInfo: clip.timestampInfo,
          }).catch(() => undefined);
        }
        : undefined,
    };
  }, [
    activeCatalogSampleId,
    preferences.inworldEnabled,
    preferences.inworldVoiceId,
    preferences.fishAudioEnabled,
    preferences.fishAudioVoiceId,
    preferences.playbackRate,
    preferences.volume,
    ttsSecrets.fishAudioApiKey,
    ttsSecrets.inworldApiKey,
  ]);

  const tts = useContinuousTTS({
    blocks: pageContent.blocks,
    blocksPageIndex: pageContent.pageIndex,
    nextPageBlocks: nextPageContent.blocks,
    nextBlocksPageIndex: nextPageContent.pageIndex,
    pageIndex,
    totalPages: readerPageCount,
    config: ttsConfig,
    onAutoAdvance: (nextPage) => pageChangeRef.current(nextPage, 'automatic'),
    onPositionUpdate: queueProgress,
  });

  useEffect(() => {
    if (!activeCatalogSampleId || !usesFirebaseSync()) return;
    let cancelled = false;
    void fetchCatalogAudioClips(activeCatalogSampleId).then((clips) => {
      if (!cancelled && clips.length > 0) tts.primeAudioCache(clips);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeCatalogSampleId, tts.primeAudioCache]);

  useEffect(() => {
    resetDebugFlagCache();
    if (isDebug('resume', 'hydrate', 'sync', 'pack')) {
      console.info(
        '[PageEcho] debug logging ON — scopes via ?debug=resume (or resume,hydrate,sync,pack / debug=1). '
        + 'Filter console for “[PageEcho:”.',
      );
    }
  }, []);

  useEffect(() => {
    saveLibrary(documents);
  }, [documents]);

  useEffect(() => {
    // Firebase boots with activeDocumentId=null until hydrate — don't wipe the
    // last-open id from localStorage before we can use it as a restore fallback.
    if (firebaseMode && !hydrateReady) return;
    saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId, hydrateReady]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (!preferences.fishAudioEnabled) return;
    const voiceId = preferences.fishAudioVoiceId.trim();
    if (!voiceId) {
      setFishVoiceTitle(null);
      return;
    }
    const cached = peekFishVoiceTitle(voiceId);
    if (cached) setFishVoiceTitle(cached);
    let cancelled = false;
    void fetchFishVoiceTitle(voiceId).then((title) => {
      if (!cancelled) setFishVoiceTitle(title);
    });
    return () => {
      cancelled = true;
    };
  }, [preferences.fishAudioEnabled, preferences.fishAudioVoiceId]);

  useEffect(() => {
    const uninstall = installGlobalErrorReporting();
    if (!firebaseMode) {
      setAuthUser(null);
      setSyncAuthUid(null);
      setHydrateReady(true);
      return uninstall;
    }

    let cancelled = false;
    let unsubscribe = () => {};

    // Finish redirect, wait for persistence, then subscribe — never mint a guest
    // over a Google session that hasn't finished restoring.
    void (async () => {
      try {
        await Promise.race([
          completeGoogleRedirectIfPresent(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 8000);
          }),
        ]);
      } catch (error) {
        if (!cancelled) console.error('[PageEcho] Google redirect sign-in failed', error);
      }
      if (cancelled) return;
      clearFirebaseAuthHandlerUrl();

      try {
        await waitForAuthReady();
      } catch (error) {
        if (!cancelled) console.error('[PageEcho] Auth ready failed', error);
      }
      if (cancelled) return;

      // If nothing was restored, mint a guest once before listening.
      if (!cancelled) {
        try {
          await ensureAnonymousSession();
        } catch (error) {
          console.error('[PageEcho] Anonymous sign-in failed', error);
          if (!cancelled) {
            setAuthBootError(
              error instanceof Error ? error.message : 'Anonymous sign-in failed.',
            );
            setAuthUser(null);
          }
        }
      }
      if (cancelled) return;

      unsubscribe = subscribeAuth((user) => {
        if (!user) {
          void ensureAnonymousSession().catch((error) => {
            console.error('[PageEcho] Anonymous sign-in failed', error);
            if (!cancelled) {
              setAuthBootError(
                error instanceof Error ? error.message : 'Anonymous sign-in failed.',
              );
              setAuthUser(null);
            }
          });
          return;
        }

        const switchedAccount = Boolean(
          lastAuthUidRef.current && lastAuthUidRef.current !== user.uid,
        );
        lastAuthUidRef.current = user.uid;

        // Guests / account switches must not paint another account's active book.
        // Only clear persisted last-open when leaving a prior uid — first Google
        // restore must keep the boot snapshot for hydrate.
        if (user.isAnonymous || switchedAccount) {
          setActiveDocumentId(null);
          if (switchedAccount) {
            saveActiveDocumentId(null);
            bootActiveDocumentIdRef.current = null;
          }
          setBookStream(null);
          setSource(null);
          setDocumentError(null);
          setLibraryOpen(true);
          if (user.isAnonymous && switchedAccount) {
            setDocuments([]);
            saveLibrary([]);
          }
        }

        setAuthBootError(null);
        setAuthUser(user);
        setSyncAuthUid(user.uid);
      });
    })();

    return () => {
      cancelled = true;
      uninstall();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (firebaseMode && !authUser) {
      setHydrateReady(false);
      return;
    }

    let active = true;
    setDeviceSyncStatus('syncing');
    fetchBootstrap()
      .then(async (bootstrap) => {
        if (!active) return;

        const localLibrary = loadLibrary();
        const localPreferences = loadPreferences();
        const serverHasLibrary = bootstrap.library.length > 0;
        const serverHasPreferences = (bootstrap.preferences.updatedAt ?? 0) > 0;
        const localHasLibrary = localLibrary.length > 0;

        skipNextLibraryPushRef.current = true;
        skipNextPreferencesPushRef.current = true;

        if (serverHasPreferences) {
          const merged = {
            ...localPreferences,
            ...bootstrap.preferences,
            inworldApiKey: '',
            fishAudioApiKey: '',
          };
          // Legacy cloud prefs defaulted Fish off → system TTS; prefer Fish when neither is on.
          if (!merged.fishAudioEnabled && !merged.inworldEnabled) {
            merged.fishAudioEnabled = true;
          }
          setPreferences(merged);
        } else {
          await putPreferences(toSyncedPreferences(localPreferences));
        }

        const isAnonymous = Boolean(authUser?.isAnonymous);

        if (serverHasLibrary) {
          const pendingMerge = pendingLibraryMergeRef.current;
          pendingLibraryMergeRef.current = null;
          // Merge cloud with local (and any pending import) so a poisoned cloud
          // page-0 row can't wipe a correct local last-page.
          const merged = normalizeLibraryDocuments(
            mergeLibraryDocuments(
              bootstrap.library,
              pendingMerge
                ? mergeLibraryDocuments(localLibrary, pendingMerge)
                : localLibrary,
            ),
          );
          setDocuments(merged);
          const progressHealed = merged.some((doc) => {
            const cloud = bootstrap.library.find((entry) => entry.id === doc.id);
            return !cloud
              || cloud.currentPageIndex !== doc.currentPageIndex
              || cloud.totalPages !== doc.totalPages
              || cloud.activeStreamIndex !== doc.activeStreamIndex;
          });
          if (pendingMerge || progressHealed) {
            await putLibrary(merged, bootstrap.activeDocumentId ?? loadActiveDocumentId());
          }
          // Guests land on home — never auto-open a book that may belong to another account's sync.
          if (isAnonymous) {
            setActiveDocumentId(null);
            setLibraryOpen(true);
            debugLog('hydrate', 'guest hydrate — no auto-open', {
              libraryCount: merged.length,
              cloudActive: bootstrap.activeDocumentId,
            });
          } else {
            // Cloud → live local → boot snapshot → shelf top.
            const preferredActive = resolveActiveDocumentId(merged, [
              bootstrap.activeDocumentId,
              loadActiveDocumentId(),
              bootActiveDocumentIdRef.current,
            ]);
            setActiveDocumentId(preferredActive);
            if (preferredActive) {
              setLibraryOpen(false);
              // Make sure the next refresh has cloud truth even if library debounce is skipped.
              void putActiveDocumentId(preferredActive).catch(() => undefined);
            }
            const activeDoc = merged.find((doc) => doc.id === preferredActive);
            if (activeDoc) {
              // Don't clamp to stale totalPages (sample stubs ship as 1).
              setPageIndex(Math.max(0, activeDoc.currentPageIndex ?? 0));
              setSavedBlockIndex(activeDoc.activeBlockIndex);
              setSavedWordIndex(activeDoc.activeWordIndex);
            }
            const cloudActive = preferredActive
              ? bootstrap.library.find((doc) => doc.id === preferredActive)
              : null;
            const localActive = preferredActive
              ? localLibrary.find((doc) => doc.id === preferredActive)
              : null;
            debugLog('hydrate', 'library hydrate', {
              preferredActive,
              cloudActiveDocumentId: bootstrap.activeDocumentId,
              localActiveDocumentId: loadActiveDocumentId(),
              bootActiveDocumentId: bootActiveDocumentIdRef.current,
              progressHealed,
              cloudProgress: cloudActive ? {
                page: cloudActive.currentPageIndex,
                stream: cloudActive.activeStreamIndex,
                totalPages: cloudActive.totalPages,
                updatedAt: cloudActive.updatedAt,
              } : null,
              localProgress: localActive ? {
                page: localActive.currentPageIndex,
                stream: localActive.activeStreamIndex,
                totalPages: localActive.totalPages,
                updatedAt: localActive.updatedAt,
              } : null,
              mergedProgress: activeDoc ? {
                page: activeDoc.currentPageIndex,
                stream: activeDoc.activeStreamIndex,
                totalPages: activeDoc.totalPages,
                block: activeDoc.activeBlockIndex,
                word: activeDoc.activeWordIndex,
              } : null,
            });
          }
        } else if (localHasLibrary && !isAnonymous) {
          const seedLibrary = normalizeLibraryDocuments(
            pendingLibraryMergeRef.current
              ? mergeLibraryDocuments(localLibrary, pendingLibraryMergeRef.current)
              : localLibrary,
          );
          pendingLibraryMergeRef.current = null;
          const seedActive = resolveActiveDocumentId(seedLibrary, [
            loadActiveDocumentId(),
            bootActiveDocumentIdRef.current,
          ]);
          // Seed cloud/server from this device so other clients can pull next.
          await putLibrary(seedLibrary, seedActive);
          setDocuments(seedLibrary);
          setActiveDocumentId(seedActive);
          if (seedActive) {
            setLibraryOpen(false);
            const activeDoc = seedLibrary.find((doc) => doc.id === seedActive);
            if (activeDoc) {
              setPageIndex(Math.max(0, activeDoc.currentPageIndex ?? 0));
              setSavedBlockIndex(activeDoc.activeBlockIndex);
              setSavedWordIndex(activeDoc.activeWordIndex);
            }
          }
          for (const document of seedLibrary) {
            if (document.isSample || document.catalogSampleId) continue;
            try {
              const sourceFile = await loadSourceFile(document);
              if (usesFirebaseSync()) {
                if (!(sourceFile instanceof File)) continue;
                if (document.kind === 'markdown-zip') {
                  const pages = await extractMarkdownPages(sourceFile);
                  await syncProcessedPages(
                    document.id,
                    pages.map((markdown, pageIndex) => ({ pageIndex, markdown })),
                  );
                } else if (document.kind === 'pdf') {
                  const { extractPdfMarkdownPages } = await import('./pdfStream');
                  const pages = await extractPdfMarkdownPages(sourceFile);
                  if (pages.length > 0) {
                    await syncProcessedPages(
                      document.id,
                      pages.map((markdown, pageIndex) => ({ pageIndex, markdown })),
                    );
                  }
                }
                continue;
              }
              if (sourceFile instanceof File) {
                await uploadDocumentBlob(document.id, 'source', sourceFile);
              }
              if (document.kind === 'markdown-zip') {
                const paired = await loadPairedPdf(document.id);
                if (paired) await uploadDocumentBlob(document.id, 'paired-pdf', paired);
              }
            } catch (error) {
              console.warn('[PageEcho] Skipped seeding document', document.id, error);
            }
          }
        } else if (isAnonymous) {
          // Fresh guest: ignore any leftover local library from a previous Google session.
          pendingLibraryMergeRef.current = null;
          setDocuments([]);
          setActiveDocumentId(null);
          saveLibrary([]);
          saveActiveDocumentId(null);
          setLibraryOpen(true);
          await putLibrary([], null);
        }

        const sponsorFish = Boolean(readFishSponsorKey());
        setInworldServerStatus(bootstrap.secrets.inworldConfigured ? 'ready' : 'missing-credential');
        setFishAudioServerStatus(
          bootstrap.secrets.fishAudioConfigured || sponsorFish ? 'ready' : 'missing-credential',
        );
        try {
          const secrets = await readSecrets();
          if (active) setTtsSecrets(secrets);
        } catch {
          if (active) setTtsSecrets({ inworldApiKey: '', fishAudioApiKey: '' });
        }
        setDeviceSyncStatus('synced');
        setLastSyncedAt(Date.now());
      })
      .catch(() => {
        if (!active) return;
        setDeviceSyncStatus('offline');
        setInworldServerStatus('offline');
        setFishAudioServerStatus(readFishSponsorKey() ? 'ready' : 'offline');
      })
      .finally(() => {
        if (active) setHydrateReady(true);
      });
    return () => {
      active = false;
    };
  }, [authUser?.uid]);

  useEffect(() => {
    if (!hydrateReady) return;
    if (skipNextPreferencesPushRef.current) {
      skipNextPreferencesPushRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setDeviceSyncStatus('syncing');
      putPreferences(toSyncedPreferences(preferences))
        .then(() => {
          setDeviceSyncStatus('synced');
          setLastSyncedAt(Date.now());
        })
        .catch(() => setDeviceSyncStatus('error'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [hydrateReady, preferences]);

  useEffect(() => {
    if (!hydrateReady) return;
    if (skipNextLibraryPushRef.current) {
      skipNextLibraryPushRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      setDeviceSyncStatus('syncing');
      putLibrary(documents, activeDocumentId)
        .then(() => {
          setDeviceSyncStatus('synced');
          setLastSyncedAt(Date.now());
        })
        .catch(() => setDeviceSyncStatus('error'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [hydrateReady, documents, activeDocumentId]);

  // Persist open book immediately (separate from debounced full library sync).
  useEffect(() => {
    if (!hydrateReady || !firebaseMode) return;
    if (authUser?.isAnonymous) return;
    void putActiveDocumentId(activeDocumentId).catch(() => undefined);
  }, [hydrateReady, firebaseMode, authUser?.isAnonymous, activeDocumentId]);

  useEffect(() => {
    const onLeave = () => {
      flushProgress();
    };
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      flushProgress();
    };
  }, [flushProgress]);

  useEffect(() => {
    if (activeDocumentId && !activeDocument) {
      setActiveDocumentId(null);
    }
  }, [activeDocument, activeDocumentId]);

  useEffect(() => {
    let active = true;
    setDocumentError(null);
    setBookStream(null);
    setPairedPdf(null);
    setSource(null);
    setPageContent({ pageIndex: -1, blocks: [] });
    setNextPageContent({ pageIndex: -1, blocks: [] });
    setMarkdownBlocks([]);
    // Prefer handoff / saved stream index (stable). Never treat page-local block
    // as a stream index — that snapped refresh resume back toward page 0.
    if (!activeDocument) {
      streamAnchorDocIdRef.current = null;
      pageAnchorRef.current = null;
    } else {
      const pending = pendingHandoffRef.current;
      const pendingStream = pending
        && pending.documentId === activeDocument.id
        && typeof pending.streamIndex === 'number'
        ? pending.streamIndex
        : null;
      if (pendingStream !== null) {
        pageAnchorRef.current = null;
        streamAnchorRef.current = {
          streamIndex: pendingStream,
          wordIndex: Math.max(0, pending!.wordIndex),
        };
        streamAnchorDocIdRef.current = activeDocument.id;
        debugLog('resume', 'seed anchors from handoff', {
          documentId: activeDocument.id,
          streamIndex: pendingStream,
          wordIndex: Math.max(0, pending!.wordIndex),
        });
      } else if (streamAnchorDocIdRef.current !== activeDocument.id) {
        const wordIndex = Math.max(0, activeDocument.activeWordIndex ?? 0);
        const savedPage = Math.max(0, activeDocument.currentPageIndex ?? 0);
        const savedBlock = Math.max(0, activeDocument.activeBlockIndex ?? 0);
        // Prefer page when stream is missing OR impossibly behind saved page.
        const preferPage = shouldPreferPageResume(savedPage, activeDocument.activeStreamIndex);
        // Always keep a page anchor when we have a real saved page — resolvePackRestore
        // uses it if stream maps behind that page (poison), else prefers stream (reflow).
        pageAnchorRef.current = savedPage > 0
          ? { pageIndex: savedPage, blockIndex: savedBlock, wordIndex }
          : null;
        if (preferPage) {
          streamAnchorRef.current = { streamIndex: 0, wordIndex };
          needsStreamHealRef.current = true;
        } else {
          streamAnchorRef.current = {
            streamIndex: Math.max(0, activeDocument.activeStreamIndex ?? 0),
            wordIndex,
          };
          needsStreamHealRef.current = false;
        }
        streamAnchorDocIdRef.current = activeDocument.id;
        debugLog('resume', 'seed anchors from document', {
          documentId: activeDocument.id,
          preferPage,
          savedPage,
          savedStream: activeDocument.activeStreamIndex,
          savedBlock,
          savedWord: wordIndex,
          pageAnchor: pageAnchorRef.current,
          streamAnchor: streamAnchorRef.current,
          needsStreamHeal: needsStreamHealRef.current,
          totalPages: activeDocument.totalPages,
        });
      } else {
        debugLog('resume', 'keep existing anchors', {
          documentId: activeDocument.id,
          pageAnchor: pageAnchorRef.current,
          streamAnchor: streamAnchorRef.current,
          docPage: activeDocument.currentPageIndex,
          docStream: activeDocument.activeStreamIndex,
        });
      }
    }

    // Wait for auth bootstrap so guests don't open a previous account's active book.
    if (!hydrateReady || !activeDocument) return () => { active = false; };

    setDocumentLoading(true);
    Promise.all([
      loadSourceFile(activeDocument).then(async (local) => {
        if (local) return local;
        if (activeDocument.isSample) return null;
        const remote = await downloadDocumentBlob(
          activeDocument.id,
          'source',
          activeDocument.sourceName || `${activeDocument.name}.pdf`,
        );
        if (remote) await saveSourceFile(activeDocument.id, remote);
        return remote;
      }),
      activeDocument.kind === 'markdown-zip'
        ? loadPairedPdf(activeDocument.id).then(async (local) => {
            if (local) return local;
            const remote = await downloadDocumentBlob(
              activeDocument.id,
              'paired-pdf',
              activeDocument.pairedPdfName || `${activeDocument.name}-original.pdf`,
            );
            if (remote) await savePairedPdf(activeDocument.id, remote);
            return remote;
          })
        : Promise.resolve(null),
    ]).then(async ([loadedSource, loadedPair]) => {
      if (!active) return;

      setPairedPdf(loadedPair);

      const catalogSampleId = activeDocument.catalogSampleId
        || (activeDocument.isSample ? TELL_TALE_SAMPLE_ID : undefined);

      if (catalogSampleId) {
        let catalogPages = usesFirebaseSync()
          ? await fetchCatalogSamplePages(catalogSampleId)
          : null;
        if (!active) return;

        if (!catalogPages || catalogPages.length === 0) {
          const response = await fetch('/samples/tell-tale-heart.zip?v=1');
          if (!response.ok) throw new Error('Could not load the shared sample story.');
          const blob = await response.blob();
          const file = new File([blob], 'The Tell-Tale Heart.zip', { type: 'application/zip' });
          const sourcePages = await extractMarkdownPages(file);
          if (usesFirebaseSync()) {
            await ensureCatalogSamplePages(catalogSampleId, sourcePages, {
              title: 'The Tell-Tale Heart',
            });
            catalogPages = sourcePages.map((markdown, pageIndex) => ({ pageIndex, markdown }));
          } else {
            catalogPages = sourcePages.map((markdown, pageIndex) => ({ pageIndex, markdown }));
          }
        }

        setSource(null);
        const stream = buildBookStream(
          catalogPages.map((page) => page.markdown),
          activeDocument.name,
        );
        setBookStream(stream);
        return;
      }

      if (activeDocument.kind === 'markdown-zip') {
        if (loadedSource instanceof File) {
          setSource(loadedSource);
          const stream = await loadMarkdownStream(loadedSource, activeDocument.name);
          if (!active) return;
          setBookStream(stream);
          return;
        }

        const cloudPages = await loadProcessedPages(activeDocument.id);
        if (!active) return;
        if (!cloudPages || cloudPages.length === 0) {
          throw new Error(
            'This book’s processed text is not on this device. Re-import the ZIP on a device that has the original file.',
          );
        }
        setSource(null);
        const stream = buildBookStream(
          cloudPages.map((page) => page.markdown),
          activeDocument.name,
        );
        setBookStream(stream);
        return;
      }

      if (!loadedSource) {
        // Cross-device: original PDF stays on the importing device; use synced extract.
        const cloudPages = await loadProcessedPages(activeDocument.id);
        if (!active) return;
        if (cloudPages && cloudPages.length > 0) {
          setSource(null);
          const stream = buildBookStream(
            cloudPages.map((page) => page.markdown),
            activeDocument.name,
          );
          setBookStream(stream);
          return;
        }
        throw new Error(
          usesFirebaseSync()
            ? 'Original PDFs stay on the importing device, and no processed text is synced yet. Re-open the PDF once on the device that has the file (to extract + sync), or re-import it here.'
            : 'The original file is not available locally or on the PageEcho server yet.',
        );
      }
      setSource(loadedSource);
      if (loadedSource instanceof File) {
        // Lazy-load pdf.js only when a PDF opens — keeps first paint light on phones.
        const { extractPdfMarkdownPages } = await import('./pdfStream');
        if (!active) return;
        const sourcePages = await extractPdfMarkdownPages(loadedSource);
        if (!active) return;
        if (sourcePages.length === 0) {
          throw new Error(
            'This PDF has no selectable text layer (it may be a scan). PageEcho needs text to build the reading view.',
          );
        }
        const stream = buildBookStream(sourcePages, activeDocument.name);
        setBookStream(stream);

        // Sync extracted text (not the PDF binary) under the signed-in account.
        if (usesFirebaseSync()) {
          try {
            await syncProcessedPages(
              activeDocument.id,
              sourcePages.map((markdown, pageIndex) => ({ pageIndex, markdown })),
            );
            if (active) {
              updateDocument(activeDocument.id, {
                hasProcessedContent: true,
                processedFormat: 'markdown-pages',
              });
            }
          } catch {
            // Reading still works locally; sync can retry on next open.
          }
        }
      }
    }).catch((error) => {
      if (active) {
        setDocumentError(error instanceof Error ? error.message : 'The book could not be opened.');
      }
    }).finally(() => {
      if (active) setDocumentLoading(false);
    });

    return () => {
      active = false;
    };
  }, [activeDocument?.id, hydrateReady, updateDocument]);

  const handleViewportPageCount = useCallback((totalPages: number) => {
    if (!activeDocument || !bookStream) return;
    if (totalPages !== activeDocument.totalPages) {
      updateDocument(activeDocument.id, { totalPages });
    }
  }, [activeDocument, bookStream, updateDocument]);

  const handleViewportRestore = useCallback((
    nextPage: number,
    localBlockIndex: number,
    wordIndex: number,
  ) => {
    const savedPage = activeDocument
      ? Math.max(0, activeDocument.currentPageIndex ?? 0)
      : 0;
    debugLog('resume', 'handleViewportRestore', {
      nextPage,
      localBlockIndex,
      wordIndex,
      savedPage,
      streamAnchor: streamAnchorRef.current,
      needsStreamHeal: needsStreamHealRef.current,
      pageAnchorRemaining: pageAnchorRef.current,
    });
    // Never snap the UI behind a trusted saved page — that was the wipe loop:
    // restore to page 1 → queueProgress → cloud poisoned to page 1.
    if (nextPage < savedPage) {
      debugLog('resume', 'reject regressive restore', {
        nextPage,
        savedPage,
        streamAnchor: streamAnchorRef.current,
      });
      if (savedPage > 0 && !pageAnchorRef.current) {
        pageAnchorRef.current = {
          pageIndex: savedPage,
          blockIndex: Math.max(0, activeDocument?.activeBlockIndex ?? 0),
          wordIndex: Math.max(0, activeDocument?.activeWordIndex ?? wordIndex),
        };
        needsStreamHealRef.current = true;
      }
      return;
    }
    setPageIndex(nextPage);
    setSavedBlockIndex(localBlockIndex);
    setSavedWordIndex(wordIndex);
    // Heal poisoned stream metadata once pack derives a real stream index.
    if (needsStreamHealRef.current && activeDocumentId) {
      const streamIndex = streamAnchorRef.current.streamIndex;
      // Never persist a title-page "heal" — that was wiping good cloud progress.
      if (nextPage <= 0 || streamIndex <= 0) {
        debugLog('resume', 'skip stream heal (title/stub)', { nextPage, streamIndex });
        return;
      }
      needsStreamHealRef.current = false;
      debugLog('resume', 'healing stream after page-anchor restore', {
        nextPage,
        streamIndex,
      });
      persistDocumentProgress(activeDocumentId, {
        currentPageIndex: nextPage,
        activeBlockIndex: localBlockIndex,
        activeWordIndex: wordIndex,
        activeStreamIndex: streamIndex,
      });
    }
  }, [activeDocument, activeDocumentId, persistDocumentProgress]);

  const {
    pages: viewportPages,
    pageStarts,
    ready: viewportReady,
    packing: viewportPacking,
    peelOverflowFromPage,
  } = useViewportBookPages({
    stream: bookStream,
    enabled: Boolean(activeDocument && bookStream),
    fontScale: preferences.fontScale,
    cacheDocumentId: activeDocumentId,
    stageRef: readerStageRef,
    pageBodyRef,
    anchorRef: streamAnchorRef,
    pageAnchorRef,
    onPageCount: handleViewportPageCount,
    onRestorePage: handleViewportRestore,
  });

  useEffect(() => {
    pageStartsRef.current = pageStarts;
  }, [pageStarts]);

  useEffect(() => {
    const next = Math.max(
      viewportPages.length,
      activeDocument?.totalPages ?? 1,
      1,
    );
    setReaderPageCount((prev) => (prev === next ? prev : next));
  }, [viewportPages.length, activeDocument?.totalPages]);

  useEffect(() => {
    setPaintedPage(null);
    paintedPageIndexRef.current = null;
    setPageTurnDir(0);
  }, [activeDocumentId]);

  useEffect(() => {
    const hasText = pageContent.blocks.some((block) => block.trim()) || markdownBlocks.length > 0;
    if (pageContent.pageIndex !== pageIndex || !hasText) return;
    if (documentLoading) return;
    if (Boolean(bookStream) && !viewportReady) return;
    setPaintedPage({
      pageIndex,
      blocks: pageContent.blocks,
      markdownBlocks,
    });
  }, [
    bookStream,
    documentLoading,
    markdownBlocks,
    pageContent.blocks,
    pageContent.pageIndex,
    pageIndex,
    viewportReady,
  ]);

  useEffect(() => {
    if (!paintedPage) return;
    if (paintedPageIndexRef.current === null) {
      paintedPageIndexRef.current = paintedPage.pageIndex;
      return;
    }
    if (paintedPageIndexRef.current === paintedPage.pageIndex) return;
    setPageTurnDir(paintedPage.pageIndex > paintedPageIndexRef.current ? 1 : -1);
    paintedPageIndexRef.current = paintedPage.pageIndex;
    const timer = window.setTimeout(() => setPageTurnDir(0), 220);
    return () => window.clearTimeout(timer);
  }, [paintedPage]);

  const chapterIndex = useMemo(
    () => (bookStream && bookStream.length > 0 ? buildChapterIndex(bookStream) : []),
    [bookStream],
  );

  const locatedChapters = useMemo(() => {
    if (chapterIndex.length === 0 || viewportPages.length === 0) return [];
    return locateChaptersOnPages(chapterIndex, viewportPages);
  }, [chapterIndex, viewportPages]);

  const currentChapterIndex = useMemo(
    () => findCurrentChapterIndex(locatedChapters, pageIndex),
    [locatedChapters, pageIndex],
  );

  // Always offer Contents for markdown; for PDFs only when titles were detected.
  const canOpenChapters = activeDocument?.kind === 'markdown-zip'
    || locatedChapters.length > 0;

  useEffect(() => {
    if (!activeDocument || !bookStream || !viewportReady) return;
    const nextPageIndex = clampPage(pageIndex, viewportPages.length || 1);
    const page = viewportPages[nextPageIndex] ?? [];
    const blocks = streamPageToMarkdownBlocks(page);
    setMarkdownBlocks(blocks);
    setPageContent({
      pageIndex: nextPageIndex,
      blocks: blocks.map((block) => block.text),
    });

    const nextPage = viewportPages[nextPageIndex + 1];
    setNextPageContent(nextPage === undefined
      ? { pageIndex: -1, blocks: [] }
      : {
          pageIndex: nextPageIndex + 1,
          blocks: streamPageToMarkdownBlocks(nextPage).map((block) => block.text),
        });
  }, [activeDocument?.id, bookStream, pageIndex, viewportPages, viewportReady]);

  // After paint: if live prose still overflows the band above the footer,
  // peel enough trailing blocks onto the next page in one shot.
  // Skip while background precise pack is still measuring — peels fight that work.
  useLayoutEffect(() => {
    const viewportBook = Boolean(bookStream);
    const preparing = documentLoading
      || (viewportBook && !viewportReady)
      || pageContent.pageIndex !== pageIndex;
    if (!viewportBook || !viewportReady || preparing || viewportPacking) return;
    const body = pageBodyRef.current;
    const prose = body?.querySelector('.pe-prose') as HTMLElement | null;
    if (!body || !prose) return;

    const styles = window.getComputedStyle(body);
    const paddingY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
    const available = body.clientHeight - paddingY;
    if (available < 80) return;
    if (prose.scrollHeight <= available + 2) return;

    const page = viewportPages[pageIndex] ?? [];
    if (page.length <= 1) return;

    // Walk from the end until the remaining stack fits the body band.
    let removeCount = 1;
    while (removeCount < page.length) {
      const keepUntil = page.length - removeCount - 1;
      const first = prose.children[0] as HTMLElement | undefined;
      const last = prose.children[keepUntil] as HTMLElement | undefined;
      const height = first && last
        ? Math.ceil((last.offsetTop + last.offsetHeight) - first.offsetTop)
        : Number.POSITIVE_INFINITY;
      if (height <= available) break;
      removeCount += 1;
    }

    peelOverflowFromPage(pageIndex, removeCount);
  }, [
    bookStream,
    documentLoading,
    viewportReady,
    viewportPacking,
    pageContent.pageIndex,
    pageIndex,
    markdownBlocks,
    viewportPages,
    peelOverflowFromPage,
  ]);

  const changePage = useCallback((requestedPage: number, sourceOfChange: PageChangeSource) => {
    if (!activeDocument) return;
    // Viewport pack count is source of truth; library totalPages can lag at 1.
    const pageCount = Math.max(
      viewportPages.length,
      pageStartsRef.current.length,
      activeDocument.totalPages,
      1,
    );
    const nextPage = clampPage(requestedPage, pageCount);
    debugLog('resume', 'changePage', {
      requestedPage,
      nextPage,
      pageCount,
      sourceOfChange,
      documentId: activeDocument.id,
      totalPagesField: activeDocument.totalPages,
      viewportLen: viewportPages.length,
    });
    if (sourceOfChange !== 'automatic') tts.stop();
    flushProgress();
    setPageIndex(nextPage);
    setSavedBlockIndex(0);
    setSavedWordIndex(0);
    const trusted = hasTrustedPageStarts(pageStartsRef.current, nextPage);
    const streamIndex = trusted ? (pageStartsRef.current[nextPage] ?? 0) : null;
    if (streamIndex !== null) {
      streamAnchorRef.current = { streamIndex, wordIndex: 0 };
    }
    pageAnchorRef.current = null;
    // If this page is already packed, paint it immediately — don't flash the
    // preparing spinner while background refit is still measuring later pages.
    const packed = bookStream ? viewportPages[nextPage] : undefined;
    if (packed) {
      const blocks = streamPageToMarkdownBlocks(packed);
      setMarkdownBlocks(blocks);
      setPageContent({
        pageIndex: nextPage,
        blocks: blocks.map((block) => block.text),
      });
      const following = viewportPages[nextPage + 1];
      setNextPageContent(following === undefined
        ? { pageIndex: -1, blocks: [] }
        : {
          pageIndex: nextPage + 1,
          blocks: streamPageToMarkdownBlocks(following).map((block) => block.text),
        });
    } else {
      setPageContent({ pageIndex: -1, blocks: [] });
      setNextPageContent({ pageIndex: -1, blocks: [] });
      setMarkdownBlocks([]);
    }
    persistDocumentProgress(activeDocument.id, {
      currentPageIndex: nextPage,
      activeBlockIndex: 0,
      activeWordIndex: 0,
      activeStreamIndex: streamIndex,
    });
  }, [activeDocument, bookStream, flushProgress, persistDocumentProgress, tts.stop, viewportPages]);

  useEffect(() => {
    pageChangeRef.current = changePage;
  }, [changePage]);

  const selectDocument = useCallback((document: LibraryDocument) => {
    tts.stop();
    flushProgress();
    setActiveDocumentId(document.id);
    setPageIndex(clampPage(document.currentPageIndex, document.totalPages));
    setSavedBlockIndex(document.activeBlockIndex);
    setSavedWordIndex(document.activeWordIndex);
    setReaderView('reading');
    setLibraryOpen(false);
    setHandoffError(null);
  }, [flushProgress, tts.stop]);

  const applyHandoffTarget = useCallback((target: HandoffTarget) => {
    const document = documents.find((entry) => entry.id === target.documentId);
    if (!document) return false;
    tts.stop();

    // Stream index is stable across devices; page/block are derived for this viewport.
    const streamIndex = resolveHandoffStreamIndex(target, pageStartsRef.current);
    const starts = pageStartsRef.current;
    const packedPages = starts.length > 0 ? starts.length : Math.max(1, document.totalPages);
    const nextPage = starts.length > 0
      ? findPageForStreamIndex(starts, streamIndex)
      : clampPage(target.pageIndex, packedPages);
    const pageStart = starts[nextPage] ?? 0;
    const localBlock = Math.max(0, streamIndex - pageStart);
    const wordIndex = Math.max(0, target.wordIndex);

    streamAnchorRef.current = { streamIndex, wordIndex };
    streamAnchorDocIdRef.current = document.id;
    pageAnchorRef.current = null;
    setActiveDocumentId(document.id);
    setPageIndex(nextPage);
    setSavedBlockIndex(localBlock);
    setSavedWordIndex(wordIndex);
    setReaderView('reading');
    setLibraryOpen(false);
    setHandoffError(null);
    setHandoffResume(null);
    persistDocumentProgress(document.id, {
      currentPageIndex: nextPage,
      activeBlockIndex: localBlock,
      activeWordIndex: wordIndex,
      activeStreamIndex: streamIndex,
    });
    pendingHandoffRef.current = null;
    handoffArrivalRef.current = null;
    handoffResumeShownRef.current = false;
    clearPendingHandoff();
    clearHandoffFromUrl();
    return true;
  }, [documents, persistDocumentProgress, tts.stop]);

  const dismissPendingHandoff = useCallback(() => {
    pendingHandoffRef.current = null;
    handoffArrivalRef.current = null;
    handoffResumeShownRef.current = false;
    clearPendingHandoff();
    clearHandoffFromUrl();
    setHandoffError(null);
    setHandoffResume(null);
  }, []);

  useEffect(() => {
    if (!hydrateReady) return;
    const target = pendingHandoffRef.current;
    if (!target) return;
    clearHandoffFromUrl();
    savePendingHandoff(target);

    const signedIn = Boolean(authUser && !authUser.isAnonymous);
    const catalogHandoff = isCatalogSampleDocumentId(target.documentId);

    // Personal books still need the same Google account. Catalog samples are
    // public content — guests can resume from position alone.
    if (!signedIn && !catalogHandoff) {
      handoffArrivalRef.current = 'storage';
      setHandoffError(
        'Sign in with the same Google account to continue this handoff on this device.',
      );
      setLibraryOpen(true);
      return;
    }

    const document = documents.find((entry) => entry.id === target.documentId);
    if (!document && catalogHandoff) {
      // Seed the shared sample stub; effect re-runs once it's in the library.
      const stub = createTellTaleLibraryDocument({
        currentPageIndex: Math.max(0, target.pageIndex),
        activeBlockIndex: Math.max(0, target.blockIndex),
        activeWordIndex: Math.max(0, target.wordIndex),
        ...(typeof target.streamIndex === 'number'
          ? { activeStreamIndex: Math.max(0, target.streamIndex) }
          : {}),
      });
      setDocuments((current) => normalizeLibraryDocuments([stub, ...current]));
      return;
    }

    if (!document) {
      setHandoffError(
        'This handoff link points to a book that isn’t in this library yet.',
      );
      setLibraryOpen(true);
      return;
    }

    setHandoffError(null);

    // Fresh URL open → jump straight to the page (signed-in or guest sample).
    if (handoffArrivalRef.current === 'url') {
      applyHandoffTarget(target);
      return;
    }

    // Revived after guest → login (or a stored handoff) → ask once.
    if (!handoffResumeShownRef.current) {
      handoffResumeShownRef.current = true;
      setHandoffResume(target);
    }
  }, [applyHandoffTarget, authUser, documents, hydrateReady]);

  const openLegalDoc = useCallback((docId: LegalDocId) => {
    setLegalDoc(docId);
    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', `#${docId}`);
    }
  }, []);

  const closeLegalDoc = useCallback(() => {
    setLegalDoc(null);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.hash === '#terms' || url.hash === '#privacy') {
      url.hash = '';
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setLegalDoc(parseLegalHash(window.location.hash));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openHandoff = useCallback(() => {
    if (!activeDocument) return;
    flushProgress();
    const blockIndex = tts.isPlaying && tts.activeBlockIndex >= 0 ? tts.activeBlockIndex : savedBlockIndex;
    const wordIndex = tts.isPlaying && tts.activeWordIndex >= 0 ? tts.activeWordIndex : savedWordIndex;
    const localBlock = Math.max(0, blockIndex);
    const localWord = Math.max(0, wordIndex);
    const trusted = hasTrustedPageStarts(pageStartsRef.current, pageIndex);
    const streamIndex = trusted
      ? (pageStartsRef.current[pageIndex] ?? 0) + localBlock
      : streamAnchorRef.current.streamIndex;
    const target: HandoffTarget = {
      documentId: activeDocument.id,
      pageIndex,
      blockIndex: localBlock,
      wordIndex: localWord,
      streamIndex,
    };
    streamAnchorRef.current = { streamIndex, wordIndex: localWord };
    persistDocumentProgress(activeDocument.id, {
      currentPageIndex: pageIndex,
      activeBlockIndex: target.blockIndex,
      activeWordIndex: target.wordIndex,
      activeStreamIndex: trusted ? streamIndex : null,
    });
    setHandoffUrl(buildHandoffUrl(window.location.origin, target));
    setHandoffOpen(true);
  }, [
    activeDocument,
    flushProgress,
    pageIndex,
    persistDocumentProgress,
    savedBlockIndex,
    savedWordIndex,
    tts.activeBlockIndex,
    tts.activeWordIndex,
    tts.isPlaying,
  ]);

  const importFiles = useCallback(async (files: File[]) => {
    setImportBusy(true);
    setImportError(null);
    const imported: LibraryDocument[] = [];
    try {
      for (const file of files) {
        const lowerName = file.name.toLowerCase();
        if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.zip')) {
          throw new Error(`${file.name} is not a PDF or ZIP archive.`);
        }
        let totalPages = 1;
        let sourcePages: string[] | null = null;
        if (lowerName.endsWith('.zip')) {
          const provisionalName = file.name.replace(/\.(pdf|zip)$/i, '');
          sourcePages = await extractMarkdownPages(file);
          totalPages = (await loadMarkdownBook(file, provisionalName)).length;
        }
        const document = createLibraryDocument(file, totalPages);
        if (sourcePages) {
          document.hasProcessedContent = true;
          document.processedFormat = 'markdown-pages';
        }
        await saveSourceFile(document.id, file);
        await uploadDocumentBlob(document.id, 'source', file);
        if (sourcePages && usesFirebaseSync()) {
          await syncProcessedPages(
            document.id,
            sourcePages.map((markdown, pageIndex) => ({ pageIndex, markdown })),
          );
        }
        imported.push(document);
      }

      setDocuments((current) => [...imported, ...current]);
      if (imported[0]) {
        setActiveDocumentId(imported[0].id);
        setPageIndex(0);
        setSavedBlockIndex(0);
        setSavedWordIndex(0);
        setReaderView('reading');
      }
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The selected files could not be imported.');
    } finally {
      setImportBusy(false);
    }
  }, []);

  const importSampleStory = useCallback(async () => {
    setImportError(null);
    setImportBusy(true);
    try {
      const response = await fetch('/samples/tell-tale-heart.zip?v=1');
      if (!response.ok) {
        throw new Error('Could not load the sample short story.');
      }
      const blob = await response.blob();
      const file = new File([blob], 'The Tell-Tale Heart.zip', { type: 'application/zip' });
      const sourcePages = await extractMarkdownPages(file);
      const totalPages = Math.max(1, sourcePages.length);
      if (usesFirebaseSync()) {
        await ensureCatalogSamplePages(TELL_TALE_SAMPLE_ID, sourcePages, {
          title: 'The Tell-Tale Heart',
        });
      }
      const document = createTellTaleLibraryDocument({
        sourceName: file.name,
        totalPages,
      });
      // Keep a local copy for offline; content sync uses the shared catalog.
      await saveSourceFile(document.id, file);
      setDocuments((current) => normalizeLibraryDocuments([document, ...current]));
      setActiveDocumentId(document.id);
      setPageIndex(0);
      setSavedBlockIndex(0);
      setSavedWordIndex(0);
      setReaderView('reading');
      setImportOpen(false);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Sample import failed.');
      setImportOpen(true);
    } finally {
      setImportBusy(false);
    }
  }, []);

  const deleteDocument = useCallback(async (document: LibraryDocument) => {
    const where = usesFirebaseSync() ? 'your account' : 'the PageEcho server';
    if (!window.confirm(`Remove “${document.name}” from this device and ${where}?`)) return;
    if (activeDocumentId === document.id) {
      tts.stop();
      setActiveDocumentId(null);
      setSource(null);
      setPairedPdf(null);
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    await deleteDocumentFiles(document.id);
    try {
      await deleteSyncedDocument(document.id);
    } catch {
      setDeviceSyncStatus('error');
    }
  }, [activeDocumentId, tts.stop]);

  const pairOriginalPdf = useCallback(async (file: File) => {
    if (!activeDocument || activeDocument.kind !== 'markdown-zip') return;
    setPairBusy(true);
    try {
      await savePairedPdf(activeDocument.id, file);
      await uploadDocumentBlob(activeDocument.id, 'paired-pdf', file);
      setPairedPdf(file);
      updateDocument(activeDocument.id, { pairedPdfName: file.name, updatedAt: Date.now() });
      setReaderView('parallel');
    } finally {
      setPairBusy(false);
    }
  }, [activeDocument, updateDocument]);

  const handleSaveSecrets = useCallback(async (input: {
    inworldApiKey?: string;
    fishAudioApiKey?: string;
    clearInworld?: boolean;
    clearFishAudio?: boolean;
  }) => {
    const status = await putSecrets(input);
    const secrets = await readSecrets().catch(() => ({ inworldApiKey: '', fishAudioApiKey: '' }));
    setTtsSecrets(secrets);
    setInworldServerStatus(status.inworldConfigured ? 'ready' : 'missing-credential');
    setFishAudioServerStatus(
      status.fishAudioConfigured || Boolean(readFishSponsorKey()) ? 'ready' : 'missing-credential',
    );
    setDeviceSyncStatus('synced');
    setLastSyncedAt(Date.now());
  }, []);

  const handleHorizontalSwipe = useCallback((direction: 'prev' | 'next') => {
    if (!activeDocument) return;
    changePage(pageIndex + (direction === 'next' ? 1 : -1), 'manual');
  }, [activeDocument, changePage, pageIndex]);

  const {
    focusActive,
    chromeVisible,
    revealChrome,
    onStageTouchStart,
    onStageTouchEnd,
    onChromePointerDown,
  } = useMobileFocusChrome({
    enabled: Boolean(activeDocument),
    documentId: activeDocumentId,
    isPlaying: tts.isPlaying,
    isPaused: tts.isPaused,
    overlaysOpen: libraryOpen || settingsOpen || importOpen || chaptersOpen,
    onHorizontalSwipe: handleHorizontalSwipe,
  });

  const handlePdfTextExtracted = useCallback((blocks: string[]) => {
    setPageContent({ pageIndex, blocks });
  }, [pageIndex]);

  const handleNextPdfTextExtracted = useCallback((nextPageIndex: number, blocks: string[]) => {
    if (nextPageIndex === pageIndex + 1) {
      setNextPageContent({ pageIndex: nextPageIndex, blocks });
    }
  }, [pageIndex]);

  const handlePdfLoaded = useCallback((totalPages: number) => {
    if (!activeDocument || activeDocument.kind !== 'pdf' || totalPages === activeDocument.totalPages) return;
    updateDocument(activeDocument.id, { totalPages });
  }, [activeDocument, updateDocument]);

  const handlePairedPdfLoaded = useCallback((totalPages: number) => {
    if (!activeDocument || activeDocument.pairedPdfPages === totalPages) return;
    updateDocument(activeDocument.id, { pairedPdfPages: totalPages });
  }, [activeDocument, updateDocument]);

  const handlePause = useCallback(() => {
    tts.pause();
    flushProgress();
  }, [flushProgress, tts.pause]);

  const handleStop = useCallback(() => {
    tts.stop();
    flushProgress();
  }, [flushProgress, tts.stop]);

  const handleMediaPlay = useCallback(() => {
    if (tts.isPaused) tts.resume();
    else tts.play(savedBlockIndex, savedWordIndex);
  }, [savedBlockIndex, savedWordIndex, tts.isPaused, tts.play, tts.resume]);

  useMediaSession({
    enabled: Boolean(activeDocument),
    playbackState: toMediaSessionPlayback(tts.playbackState),
    meta: {
      title: activeDocument?.name || 'PageEcho',
      artist: 'PageEcho',
      album: activeDocument
        ? `Page ${pageIndex + 1} of ${activeDocument.totalPages}`
        : 'Reading',
      artworkUrl: typeof window !== 'undefined'
        ? `${window.location.origin}/icons/pageecho-512.png`
        : '/icons/pageecho-512.png',
    },
    handlers: {
      onPlay: handleMediaPlay,
      onPause: handlePause,
      onStop: handleStop,
      onPrevious: () => changePage(pageIndex - 1, 'manual'),
      onNext: () => changePage(pageIndex + 1, 'manual'),
    },
  });

  const displayBlockIndex = tts.isPlaying && tts.activeBlockIndex >= 0 ? tts.activeBlockIndex : savedBlockIndex;
  const displayWordIndex = tts.isPlaying && tts.activeWordIndex >= 0 ? tts.activeWordIndex : savedWordIndex;
  const progress = activeDocument
    ? calculateProgress(pageIndex, readerPageCount, displayWordIndex)
    : 0;

  const isViewportBook = Boolean(bookStream);
  const pagePreparing = documentLoading
    || (isViewportBook && !viewportReady)
    || pageContent.pageIndex !== pageIndex;

  const holdingPaintedPage = Boolean(
    pagePreparing && paintedPage && paintedPage.pageIndex !== pageIndex,
  );
  const displayPageIndex = holdingPaintedPage && paintedPage
    ? paintedPage.pageIndex
    : pageIndex;
  const displayPlainBlocks = holdingPaintedPage && paintedPage
    ? paintedPage.blocks
    : pageContent.blocks;
  const displayMarkdownBlocks = holdingPaintedPage && paintedPage
    ? paintedPage.markdownBlocks
    : markdownBlocks;
  const showPreparingSpinner = pagePreparing && !holdingPaintedPage;

  const renderTextPage = (compact = false) => (
    <article
      className={[
        'pe-reading-page',
        compact ? 'is-compact' : '',
        isViewportBook ? 'is-viewport-page' : '',
        holdingPaintedPage ? 'is-page-holding' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--reader-scale': preferences.fontScale } as React.CSSProperties}
    >
      <header className="pe-page-header">
        <span>{activeDocument?.name}</span>
        <span>{String(displayPageIndex + 1).padStart(2, '0')} / {String(readerPageCount).padStart(2, '0')}</span>
      </header>
      <div className="pe-page-body" ref={pageBodyRef}>
        {showPreparingSpinner ? (
          <div className="pe-reader-state">
            <span className="pe-spin" aria-hidden="true">
              <LoaderCircle size={25} />
            </span>
            <strong>
              {documentLoading && activeDocument?.kind === 'pdf'
                ? 'Extracting text from PDF…'
                : `Preparing page ${pageIndex + 1}`}
            </strong>
            <span>
              {documentLoading && activeDocument?.kind === 'pdf'
                ? 'Building a continuous reading stream — large books take a few seconds.'
                : 'Fitting the reading layer to your screen…'}
            </span>
          </div>
        ) : displayPlainBlocks.some((block) => block.trim()) || displayMarkdownBlocks.length ? (
          <ReaderWords
            markdownBlocks={isViewportBook ? displayMarkdownBlocks : undefined}
            plainBlocks={displayPlainBlocks}
            activeBlockIndex={holdingPaintedPage ? -1 : displayBlockIndex}
            activeWordIndex={holdingPaintedPage ? -1 : displayWordIndex}
            playbackState={holdingPaintedPage ? 'idle' : tts.playbackState}
            onWordSelect={(blockIndex, wordIndex) => tts.play(blockIndex, wordIndex)}
          />
        ) : (
          <div className="pe-reader-state">
            <FileText size={26} />
            <strong>No readable text on this page</strong>
            <span>This page had no selectable text layer. Try the next page.</span>
          </div>
        )}
      </div>
      <footer className="pe-page-footer">
        <span>PageEcho reading layer</span>
        <span>{Math.round(progress)}% complete</span>
      </footer>
    </article>
  );

  const resetLocalSessionLibrary = useCallback(() => {
    // Guest sessions must not inherit the previous account's library/active book.
    flushProgress();
    tts.stop();
    setDocuments([]);
    setActiveDocumentId(null);
    saveLibrary([]);
    saveActiveDocumentId(null);
    setBookStream(null);
    setSource(null);
    setPairedPdf(null);
    setDocumentError(null);
    setPageContent({ pageIndex: -1, blocks: [] });
    setNextPageContent({ pageIndex: -1, blocks: [] });
    setMarkdownBlocks([]);
    setLibraryOpen(true);
  }, [flushProgress, tts]);

  const handleSignOut = useCallback(async () => {
    resetLocalSessionLibrary();
    setHydrateReady(false);
    setDeviceSyncStatus('idle');
    await signOutUser();
  }, [resetLocalSessionLibrary]);

  const handleGoogleSignIn = useCallback(async () => {
    pendingLibraryMergeRef.current = documents;
    setAuthBootError(null);
    const result = await signInWithGoogle();
    if (result.previousAnonymousUid) {
      // Keep the guest library snapshot; bootstrap merge runs after auth settles.
      pendingLibraryMergeRef.current = documents;
      setHydrateReady(false);
    }
  }, [documents]);

  const handleRetryGuest = useCallback(async () => {
    setAuthBootError(null);
    setAuthUser(undefined);
    try {
      const user = await ensureAnonymousSession();
      if (!user) {
        setAuthBootError('Guest session could not be created.');
        setAuthUser(null);
      }
    } catch (error) {
      setAuthBootError(error instanceof Error ? error.message : 'Anonymous sign-in failed.');
      setAuthUser(null);
    }
  }, []);

  const isAnonymousUser = Boolean(authUser?.isAnonymous);

  if (firebaseMode && authUser === undefined) {
    return <LoginGate busy busyMessage="Restoring your session…" />;
  }
  if (firebaseMode && !authUser) {
    return (
      <LoginGate
        error={authBootError || 'Guest session unavailable.'}
        onGoogleSignIn={handleGoogleSignIn}
        onRetryGuest={handleRetryGuest}
      />
    );
  }
  // Don't mount the reader shell until account bootstrap finishes — otherwise a
  // stale local active book can flash/crash before guest home is ready.
  if (firebaseMode && !hydrateReady) {
    return (
      <LoginGate
        busy
        busyMessage={isAnonymousUser ? 'Starting a private guest session…' : 'Loading your library…'}
      />
    );
  }

  return (
    <div
      className={[
        'pe-app',
        focusActive ? 'is-focus-reading' : '',
        focusActive && chromeVisible ? 'is-chrome-visible' : '',
        firebaseMode && isAnonymousUser ? 'has-guest-banner' : '',
      ].filter(Boolean).join(' ')}
      data-theme={preferences.appearance}
    >
      <header className="pe-topbar" onPointerDown={onChromePointerDown}>
        <div className="pe-brand">
          <button className="pe-icon-button pe-mobile-only" onClick={() => setLibraryOpen((open) => !open)} aria-label="Toggle library">
            <Menu size={19} />
          </button>
          <button
            type="button"
            className="pe-brand-home"
            onClick={() => {
              tts.stop();
              setActiveDocumentId(null);
              setSource(null);
              setPairedPdf(null);
              setLibraryOpen(false);
              setSettingsOpen(false);
              setImportOpen(false);
              setChaptersOpen(false);
            }}
            aria-label="Go to home"
          >
            <span className="pe-brand-mark"><BookOpen size={18} /></span>
            <div>
              <strong>PageEcho</strong>
              <span>Read with every sense</span>
            </div>
          </button>
        </div>
        <div className="pe-topbar-actions">
          {firebaseMode && authUser ? (
            <button
              type="button"
              className={`pe-account-chip ${isAnonymousUser ? 'is-guest' : ''}`}
              onClick={() => setSettingsOpen(true)}
              aria-label="Account and settings"
            >
              {authUser.photoURL && !isAnonymousUser ? (
                <img className="pe-account-avatar" src={authUser.photoURL} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span className="pe-account-initials" aria-hidden="true">
                  {isAnonymousUser
                    ? 'G'
                    : (authUser.displayName || authUser.email || '?').slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="pe-account-label">
                {isAnonymousUser
                  ? 'Guest'
                  : (authUser.displayName?.split(' ')[0]
                    || authUser.email?.split('@')[0]
                    || 'Signed in')}
              </span>
            </button>
          ) : null}
          <button className="pe-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {firebaseMode && isAnonymousUser ? (
        <div className="pe-guest-banner" role="status">
          <p>
            You’re browsing as a guest. Sign in with Google to keep your library across devices.
          </p>
          <button
            type="button"
            className="pe-button pe-button-secondary pe-guest-sign-in"
            onClick={() => void handleGoogleSignIn()}
          >
            Sign in
          </button>
        </div>
      ) : null}

      <div className="pe-shell">
        {libraryOpen ? (
          <button
            type="button"
            className="pe-library-backdrop"
            aria-label="Close library"
            onClick={() => setLibraryOpen(false)}
          />
        ) : null}
        <div className={`pe-library-wrap ${libraryOpen ? 'is-open' : ''}`}>
          <LibrarySidebar
            documents={documents}
            activeDocumentId={activeDocumentId}
            query={query}
            onQueryChange={setQuery}
            onSelect={selectDocument}
            onImport={() => {
              setImportError(null);
              setImportOpen(true);
            }}
            onDelete={deleteDocument}
            storageHint={
              firebaseMode
                ? (isAnonymousUser ? 'Synced for this guest session' : 'Synced to your account')
                : 'Stored on this device'
            }
          />
        </div>

        <main className="pe-main">
          {handoffError ? (
            <div className="pe-handoff-banner" role="alert">
              <p>{handoffError}</p>
              <div className="pe-handoff-banner-actions">
                {firebaseMode && isAnonymousUser ? (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary"
                    onClick={() => void handleGoogleSignIn()}
                  >
                    Sign in
                  </button>
                ) : null}
                <button
                  type="button"
                  className="pe-icon-button"
                  onClick={dismissPendingHandoff}
                  aria-label="Dismiss handoff message"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : null}
          {activeDocument ? (
            <>
              <section className="pe-reader-nav" onPointerDown={onChromePointerDown}>
                <div className="pe-page-controls">
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex - 1, 'manual')} disabled={pageIndex === 0} aria-label="Previous page">
                    <ChevronLeft size={18} />
                  </button>
                  <label>
                    <input
                      value={pageIndex + 1}
                      onChange={(event) => {
                        const requested = Number(event.target.value);
                        if (Number.isFinite(requested)) changePage(requested - 1, 'manual');
                      }}
                      aria-label="Current page"
                    />
                    <span>of {activeDocument.totalPages}</span>
                  </label>
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex + 1, 'manual')} disabled={pageIndex + 1 >= Math.max(viewportPages.length, activeDocument.totalPages)} aria-label="Next page">
                    <ChevronRight size={18} />
                  </button>
                </div>
                {canOpenChapters && (
                  <button
                    type="button"
                    className="pe-button pe-button-secondary pe-chapters-trigger"
                    onClick={() => setChaptersOpen(true)}
                    aria-label="Open chapter list"
                  >
                    <ListTree size={16} />
                    <span>Contents</span>
                  </button>
                )}
                <div className="pe-reader-nav-end">
                  <div className="pe-zoom-controls">
                    <button
                      className="pe-icon-button"
                      onClick={() => setPreferences((current) => ({ ...current, fontScale: Math.max(0.78, current.fontScale - 0.08) }))}
                      aria-label="Decrease text size"
                    >
                      <ZoomOut size={17} />
                    </button>
                    <span>{Math.round(preferences.fontScale * 100)}%</span>
                    <button
                      className="pe-icon-button"
                      onClick={() => setPreferences((current) => ({ ...current, fontScale: Math.min(1.45, current.fontScale + 0.08) }))}
                      aria-label="Increase text size"
                    >
                      <ZoomIn size={17} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="pe-icon-button pe-handoff-trigger"
                    onClick={openHandoff}
                    aria-label="Handoff to phone"
                    title="Continue on phone"
                  >
                    <Smartphone size={17} />
                  </button>
                </div>
              </section>

              <section
                className="pe-reader-stage"
                ref={readerStageRef}
                onTouchStart={onStageTouchStart}
                onTouchEnd={onStageTouchEnd}
              >
                {focusActive && !chromeVisible && (
                  <>
                    <button
                      type="button"
                      className="pe-focus-edge pe-focus-edge-top"
                      aria-label="Show reader controls"
                      onClick={revealChrome}
                    />
                    <button
                      type="button"
                      className="pe-focus-edge pe-focus-edge-bottom"
                      aria-label="Show playback controls"
                      onClick={revealChrome}
                    >
                      <span />
                    </button>
                  </>
                )}
                {documentError ? (
                  <div className="pe-fatal-state">
                    <FileText size={32} />
                    <h2>This book could not be opened</h2>
                    <p>{documentError}</p>
                    {isAnonymousUser ? (
                      <p>
                        Guest sessions only see books imported in this browser session (plus the shared
                        sample). Sign in with Google to reopen books synced to your account.
                      </p>
                    ) : null}
                    <div className="pe-fatal-actions">
                      <button
                        type="button"
                        className="pe-button pe-button-secondary"
                        onClick={() => {
                          setActiveDocumentId(null);
                          setDocumentError(null);
                          setLibraryOpen(true);
                        }}
                      >
                        Back to library
                      </button>
                      <button className="pe-button pe-button-primary" onClick={() => setImportOpen(true)}>
                        <Upload size={16} /> Import another file
                      </button>
                    </div>
                  </div>
                ) : readerView === 'original' && activeDocument.kind === 'pdf' && source ? (
                  <div className="pe-single-pdf">
                    <Suspense fallback={<div className="pe-reader-state"><LoaderCircle className="pe-spin" size={25} /><strong>Loading PDF viewer…</strong></div>}>
                      <BimodalPDFViewer
                        pdfUrl={source}
                        pageIndex={pageIndex}
                        activeBlockIndex={displayBlockIndex}
                        activeWordIndex={displayWordIndex}
                        scale={Math.max(0.7, preferences.fontScale)}
                        onTextExtracted={handlePdfTextExtracted}
                        onNextPageTextExtracted={handleNextPdfTextExtracted}
                        onWordTap={(blockIndex, wordIndex) => tts.play(blockIndex, wordIndex)}
                        onPageLoadSuccess={handlePdfLoaded}
                        isPlaying={tts.isPlaying}
                        isPaused={tts.isPaused}
                        className="pe-pdf-frame"
                      />
                    </Suspense>
                  </div>
                ) : readerView === 'parallel' && activeDocument.kind === 'markdown-zip' ? (
                  pairedPdf ? (
                    <div className="pe-parallel">
                      <div
                        className={[
                          'pe-pane',
                          pageTurnDir === 1 ? 'is-turn-next' : '',
                          pageTurnDir === -1 ? 'is-turn-prev' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {renderTextPage(true)}
                      </div>
                      <div className="pe-pane pe-pane-pdf">
                        <Suspense fallback={<div className="pe-reader-state"><LoaderCircle className="pe-spin" size={25} /><strong>Loading PDF viewer…</strong></div>}>
                          <BimodalPDFViewer
                            pdfUrl={pairedPdf}
                            pageIndex={pageIndex}
                            activeBlockIndex={null}
                            activeWordIndex={null}
                            scale={Math.max(0.65, preferences.fontScale * 0.78)}
                            onTextExtracted={() => undefined}
                            onWordTap={() => undefined}
                            onPageLoadSuccess={handlePairedPdfLoaded}
                            className="pe-pdf-frame"
                          />
                        </Suspense>
                      </div>
                    </div>
                  ) : (
                    <div className="pe-pair-state">
                      <span className="pe-pair-icon"><Columns2 size={28} /></span>
                      <h2>Pair the original PDF</h2>
                      <p>Page turns, progress, and audio stay anchored to the Markdown edition while the matching PDF page appears alongside it.</p>
                      <label className="pe-button pe-button-primary">
                        <Link2 size={16} /> Choose original PDF
                        <input
                          className="pe-visually-hidden"
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) pairOriginalPdf(file);
                          }}
                        />
                      </label>
                    </div>
                  )
                ) : (
                  <div
                    className={[
                      'pe-reading-wrap',
                      pageTurnDir === 1 ? 'is-turn-next' : '',
                      pageTurnDir === -1 ? 'is-turn-prev' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {renderTextPage()}
                  </div>
                )}

              </section>

              <section
                className="pe-playback-dock"
                aria-label="Playback controls"
                onPointerDown={onChromePointerDown}
              >
                <div className="pe-playback-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="pe-playback-info">
                  <span className="pe-audio-art"><Volume2 size={18} /></span>
                  <div>
                    <strong>
                      {preferences.fishAudioEnabled
                        ? formatFishVoiceLabel(fishVoiceTitle, preferences.fishAudioVoiceId)
                        : preferences.inworldEnabled
                          ? `${preferences.inworldVoiceId} — Inworld`
                          : 'System voice'}
                    </strong>
                    <span>
                      {tts.lastError
                        ? 'Neural voice unavailable · using system fallback'
                        : tts.playbackState === 'buffering'
                        ? 'Preparing the next passage'
                        : tts.isPlaying
                          ? `Reading page ${pageIndex + 1}`
                          : `Ready at page ${pageIndex + 1}`}
                    </span>
                  </div>
                </div>
                <div className="pe-playback-buttons">
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex - 1, 'manual')} disabled={pageIndex === 0} aria-label="Previous page">
                    <ArrowLeft size={17} />
                  </button>
                  {tts.isPlaying && !tts.isPaused ? (
                    <button className="pe-play-button" onClick={handlePause} aria-label="Pause">
                      <Pause size={20} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      className="pe-play-button"
                      onClick={() => {
                        revealChrome();
                        if (tts.isPaused) tts.resume();
                        else tts.play(savedBlockIndex, savedWordIndex);
                      }}
                      disabled={documentLoading || pageContent.pageIndex !== pageIndex}
                      aria-label={tts.isPaused ? 'Resume' : 'Play'}
                    >
                      <Play size={20} fill="currentColor" />
                    </button>
                  )}
                  <button className="pe-icon-button" onClick={handleStop} disabled={!tts.isPlaying} aria-label="Stop">
                    <Square size={16} fill="currentColor" />
                  </button>
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex + 1, 'manual')} disabled={pageIndex + 1 >= Math.max(viewportPages.length, activeDocument.totalPages)} aria-label="Next page">
                    <ArrowRight size={17} />
                  </button>
                  {canOpenChapters && (
                    <button
                      className="pe-icon-button pe-chapters-trigger"
                      onClick={() => setChaptersOpen(true)}
                      aria-label="Open chapter list"
                      title="Contents"
                    >
                      <ListTree size={17} />
                    </button>
                  )}
                </div>
                <div className="pe-playback-settings">
                  <button
                    className="pe-rate-button"
                    onClick={() => {
                      const rates = [0.8, 1, 1.2, 1.5, 2];
                      const currentIndex = rates.findIndex((rate) => rate === preferences.playbackRate);
                      const nextRate = rates[(currentIndex + 1 + rates.length) % rates.length];
                      setPreferences((current) => ({ ...current, playbackRate: nextRate }));
                    }}
                  >
                    {preferences.playbackRate.toFixed(1)}×
                  </button>
                  <Volume2 size={16} />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={preferences.volume}
                    onChange={(event) => setPreferences((current) => ({ ...current, volume: Number(event.target.value) }))}
                    aria-label="Playback volume"
                  />
                </div>
              </section>

              <footer className="pe-statusbar">
                <span>{activeDocument.sourceName}</span>
                <span>
                  {activeDocument.pairedPdfName ? `Paired with ${activeDocument.pairedPdfName}` : 'Available offline'}
                  {lastSyncedAt ? ` · Synced ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
              </footer>
            </>
          ) : (
            <div className="pe-home">
              <section className="pe-welcome">
                <div className="pe-welcome-copy">
                  <span className="pe-eyebrow">A calmer way to read and listen</span>
                  <h1>Your books,<br />in perfect cadence.</h1>
                  <p>Import PDF books. PageEcho keeps your place, speaks every passage, and follows each word without losing the page.</p>
                  <div className="pe-welcome-actions">
                    <button className="pe-button pe-button-primary" onClick={() => setImportOpen(true)}>
                      <Plus size={17} /> Add your first book
                    </button>
                    <button
                      className="pe-button pe-button-secondary"
                      onClick={() => { void importSampleStory(); }}
                      disabled={importBusy}
                    >
                      {importBusy ? <LoaderCircle className="pe-spin" size={17} /> : <BookOpen size={17} />}
                      Try a sample short story
                    </button>
                  </div>
                </div>
                <div className="pe-welcome-visual" aria-hidden="true">
                  <div className="pe-visual-card pe-visual-card-back">
                    <span>04</span>
                    <p>“The reader’s attention moves with the voice.”</p>
                  </div>
                  <div className="pe-visual-card pe-visual-card-front">
                    <div className="pe-visual-line" />
                    <div className="pe-visual-line is-short" />
                    <p>Ideas become clearer when text and sound move together.</p>
                    <div className="pe-visual-highlight">move together</div>
                    <div className="pe-visual-wave"><i /><i /><i /><i /><i /><i /><i /></div>
                  </div>
                </div>
              </section>
              <footer className="pe-home-footer">
                <p className="pe-home-footer-note">
                  PageEcho is free and open source. If it helps you read, a small sponsorship keeps the lights on.
                </p>
                <div className="pe-home-footer-row">
                  <div className="pe-home-footer-cta">
                    <a
                      className="pe-icon-button"
                      href={GITHUB_REPO_URL}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="PageEcho on GitHub"
                      title="GitHub"
                    >
                      <GitHubMark size={17} />
                    </a>
                    <a
                      className="pe-sponsor-link"
                      href={GITHUB_SPONSORS_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Heart size={14} />
                      Sponsor
                    </a>
                  </div>
                  <nav className="pe-home-footer-legal" aria-label="Legal">
                    <button type="button" className="pe-text-link" onClick={() => openLegalDoc('terms')}>
                      Terms
                    </button>
                    <span aria-hidden="true">·</span>
                    <button type="button" className="pe-text-link" onClick={() => openLegalDoc('privacy')}>
                      Privacy
                    </button>
                  </nav>
                </div>
              </footer>
            </div>
          )}
        </main>
      </div>

      <ImportDialog
        open={importOpen}
        busy={importBusy}
        error={importError}
        onClose={() => setImportOpen(false)}
        onImport={importFiles}
        onImportSample={() => { void importSampleStory(); }}
      />
      <ChapterListPanel
        open={chaptersOpen}
        bookTitle={activeDocument?.name || 'Book'}
        chapters={locatedChapters}
        currentChapterIndex={currentChapterIndex}
        onJump={(nextPage) => {
          changePage(nextPage, 'manual');
          setChaptersOpen(false);
          revealChrome();
        }}
        onClose={() => setChaptersOpen(false)}
      />
      <SettingsPanel
        open={settingsOpen}
        preferences={preferences}
        inworldServerStatus={inworldServerStatus}
        fishAudioServerStatus={fishAudioServerStatus}
        deviceSyncStatus={deviceSyncStatus}
        accountLabel={
          isAnonymousUser
            ? 'Guest (temporary)'
            : (authUser?.email ?? authUser?.displayName ?? null)
        }
        isAnonymous={isAnonymousUser}
        cloudSync={firebaseMode}
        onSignIn={firebaseMode && isAnonymousUser ? handleGoogleSignIn : undefined}
        onSignOut={firebaseMode && !isAnonymousUser ? handleSignOut : undefined}
        onChange={setPreferences}
        onSaveSecrets={handleSaveSecrets}
        onClose={() => setSettingsOpen(false)}
      />
      <HandoffDialog
        open={handoffOpen}
        url={handoffUrl}
        bookTitle={activeDocument?.name || 'this book'}
        pageLabel={`page ${pageIndex + 1}`}
        requiresSignIn={Boolean(
          firebaseMode
          && isAnonymousUser
          && !activeDocument?.isSample
          && !isCatalogSampleDocumentId(activeDocument?.id ?? ''),
        )}
        catalogSample={Boolean(
          activeDocument?.isSample || isCatalogSampleDocumentId(activeDocument?.id ?? ''),
        )}
        onSignIn={firebaseMode && isAnonymousUser ? () => { void handleGoogleSignIn(); } : undefined}
        onClose={() => setHandoffOpen(false)}
      />
      <HandoffResumeDialog
        open={Boolean(handoffResume)}
        target={handoffResume || { documentId: '', pageIndex: 0, blockIndex: 0, wordIndex: 0 }}
        bookTitle={
          (handoffResume && documents.find((document) => document.id === handoffResume.documentId)?.name)
          || 'your book'
        }
        onContinue={() => {
          if (handoffResume) applyHandoffTarget(handoffResume);
        }}
        onDismiss={dismissPendingHandoff}
      />
      <LegalDialog docId={legalDoc} onClose={closeLegalDoc} />
      <ConsentBanner />
    </div>
  );
}
