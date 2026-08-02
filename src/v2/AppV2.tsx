import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Columns2,
  FileText,
  Library,
  Link2,
  ListTree,
  LoaderCircle,
  Menu,
  Moon,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Settings,
  Square,
  Sun,
  Upload,
  Volume2,
  Wifi,
  WifiOff,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BimodalPDFViewer } from '../components/BimodalPDFViewer';
import type { MarkdownBlock } from '../hooks/useTTS';
import { streamPageToMarkdownBlocks } from './bookStream';
import {
  buildChapterIndex,
  findCurrentChapterIndex,
  locateChaptersOnPages,
} from './chapters';
import { calculateProgress, loadMarkdownBook, loadMarkdownStream, type BookStreamBlock } from './documents';
import { ChapterListPanel } from './components/ChapterListPanel';
import { ImportDialog } from './components/ImportDialog';
import { LibrarySidebar } from './components/LibrarySidebar';
import { ReaderWords } from './components/ReaderWords';
import { SettingsPanel } from './components/SettingsPanel';
import { useViewportBookPages } from './useViewportBookPages';
import {
  createDocumentId,
  deleteDocumentFiles,
  loadActiveDocumentId,
  loadLibrary,
  loadPairedPdf,
  loadPreferences,
  loadSourceFile,
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
  putLibrary,
  putPreferences,
  putSecrets,
  toSyncedPreferences,
  uploadDocumentBlob,
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
import './styles.css';

type PageChangeSource = 'manual' | 'automatic';

interface PendingProgress {
  documentId: string;
  pageIndex: number;
  blockIndex: number;
  wordIndex: number;
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

export default function AppV2() {
  const [documents, setDocuments] = useState<LibraryDocument[]>(loadLibrary);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(loadActiveDocumentId);
  const activeDocument = documents.find((document) => document.id === activeDocumentId) ?? null;

  const [pageIndex, setPageIndex] = useState(() => activeDocument?.currentPageIndex ?? 0);
  const [savedBlockIndex, setSavedBlockIndex] = useState(() => activeDocument?.activeBlockIndex ?? 0);
  const [savedWordIndex, setSavedWordIndex] = useState(() => activeDocument?.activeWordIndex ?? 0);
  const [readerView, setReaderView] = useState<ReaderView>('reading');
  const [pageContent, setPageContent] = useState<PageContent>({ pageIndex: -1, blocks: [] });
  const [nextPageContent, setNextPageContent] = useState<PageContent>({ pageIndex: -1, blocks: [] });
  const [markdownBlocks, setMarkdownBlocks] = useState<MarkdownBlock[]>([]);
  const [bookStream, setBookStream] = useState<BookStreamBlock[] | null>(null);
  const [source, setSource] = useState<File | string | null>(null);
  const [pairedPdf, setPairedPdf] = useState<File | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState(loadPreferences);
  const [deviceSyncStatus, setDeviceSyncStatus] = useState<DeviceSyncStatus>('idle');
  const [inworldServerStatus, setInworldServerStatus] = useState<TtsServerStatus>('checking');
  const [fishAudioServerStatus, setFishAudioServerStatus] = useState<TtsServerStatus>('checking');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(() => !loadActiveDocumentId());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [hydrateReady, setHydrateReady] = useState(false);

  const pageChangeRef = useRef<(nextPage: number, source: PageChangeSource) => void>(() => undefined);
  const pendingProgressRef = useRef<PendingProgress | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const skipNextLibraryPushRef = useRef(true);
  const skipNextPreferencesPushRef = useRef(true);
  const readerStageRef = useRef<HTMLElement | null>(null);
  const pageBodyRef = useRef<HTMLDivElement | null>(null);
  const streamAnchorRef = useRef({ streamIndex: 0, wordIndex: 0 });
  const pageStartsRef = useRef<number[]>([0]);

  const updateDocument = useCallback((documentId: string, patch: Partial<LibraryDocument>) => {
    setDocuments((current) => current.map((document) => (
      document.id === documentId ? { ...document, ...patch } : document
    )));
  }, []);

  const flushProgress = useCallback(() => {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    const progress = pendingProgressRef.current;
    if (!progress) return;
    pendingProgressRef.current = null;
    updateDocument(progress.documentId, {
      currentPageIndex: progress.pageIndex,
      activeBlockIndex: progress.blockIndex,
      activeWordIndex: progress.wordIndex,
      updatedAt: Date.now(),
    });
  }, [updateDocument]);

  const queueProgress = useCallback((blockIndex: number, wordIndex: number) => {
    if (!activeDocumentId) return;
    setSavedBlockIndex(blockIndex);
    setSavedWordIndex(wordIndex);
    const streamIndex = (pageStartsRef.current[pageIndex] ?? 0) + blockIndex;
    streamAnchorRef.current = { streamIndex, wordIndex };
    pendingProgressRef.current = {
      documentId: activeDocumentId,
      pageIndex,
      blockIndex,
      wordIndex,
    };
    if (progressTimerRef.current === null) {
      progressTimerRef.current = window.setTimeout(flushProgress, 450);
    }
  }, [activeDocumentId, flushProgress, pageIndex]);

  const ttsConfig = useMemo(() => ({
    rate: preferences.playbackRate,
    volume: preferences.volume,
    inworldEnabled: preferences.inworldEnabled || preferences.fishAudioEnabled,
    inworldEndpoint: '/api/tts/synthesize',
    inworldVoiceId: preferences.inworldVoiceId,
    provider: preferences.fishAudioEnabled ? ('fish-audio' as const) : ('inworld' as const),
    fishAudioVoiceId: preferences.fishAudioVoiceId,
  }), [
    preferences.inworldEnabled,
    preferences.inworldVoiceId,
    preferences.fishAudioEnabled,
    preferences.fishAudioVoiceId,
    preferences.playbackRate,
    preferences.volume,
  ]);

  const tts = useContinuousTTS({
    blocks: pageContent.blocks,
    blocksPageIndex: pageContent.pageIndex,
    nextPageBlocks: nextPageContent.blocks,
    nextBlocksPageIndex: nextPageContent.pageIndex,
    pageIndex,
    totalPages: activeDocument?.totalPages ?? 1,
    config: ttsConfig,
    onAutoAdvance: (nextPage) => pageChangeRef.current(nextPage, 'automatic'),
    onPositionUpdate: queueProgress,
  });

  useEffect(() => {
    saveLibrary(documents);
  }, [documents]);

  useEffect(() => {
    saveActiveDocumentId(activeDocumentId);
  }, [activeDocumentId]);

  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
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
          setPreferences({
            ...localPreferences,
            ...bootstrap.preferences,
            inworldApiKey: '',
            fishAudioApiKey: '',
          });
        } else {
          await putPreferences(toSyncedPreferences(localPreferences));
        }

        if (serverHasLibrary) {
          setDocuments(bootstrap.library);
          setActiveDocumentId(bootstrap.activeDocumentId);
          const active = bootstrap.library.find((doc) => doc.id === bootstrap.activeDocumentId);
          if (active) {
            setPageIndex(clampPage(active.currentPageIndex, active.totalPages));
            setSavedBlockIndex(active.activeBlockIndex);
            setSavedWordIndex(active.activeWordIndex);
          }
        } else if (localHasLibrary) {
          // Seed the server from this device so the phone can pull next.
          await putLibrary(localLibrary, loadActiveDocumentId());
          for (const document of localLibrary) {
            if (document.isSample) continue;
            const source = await loadSourceFile(document);
            if (source instanceof File) {
              await uploadDocumentBlob(document.id, 'source', source);
            }
            if (document.kind === 'markdown-zip') {
              const paired = await loadPairedPdf(document.id);
              if (paired) await uploadDocumentBlob(document.id, 'paired-pdf', paired);
            }
          }
        }

        setInworldServerStatus(bootstrap.secrets.inworldConfigured ? 'ready' : 'missing-credential');
        setFishAudioServerStatus(bootstrap.secrets.fishAudioConfigured ? 'ready' : 'missing-credential');
        setDeviceSyncStatus('synced');
        setLastSyncedAt(Date.now());
      })
      .catch(() => {
        if (!active) return;
        setDeviceSyncStatus('offline');
        setInworldServerStatus('offline');
        setFishAudioServerStatus('offline');
      })
      .finally(() => {
        if (active) setHydrateReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => () => {
    flushProgress();
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
    streamAnchorRef.current = {
      streamIndex: Math.max(0, activeDocument?.activeBlockIndex ?? 0),
      wordIndex: Math.max(0, activeDocument?.activeWordIndex ?? 0),
    };

    if (!activeDocument) return () => { active = false; };

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
      if (!loadedSource) {
        throw new Error('The original file is not available locally or on the PageEcho server yet.');
      }

      setSource(loadedSource);
      setPairedPdf(loadedPair);
      if (activeDocument.kind === 'markdown-zip') {
        if (!(loadedSource instanceof File)) {
          throw new Error('This Markdown archive cannot be read from its stored source.');
        }
        const stream = await loadMarkdownStream(loadedSource, activeDocument.name);
        if (!active) return;
        streamAnchorRef.current = {
          streamIndex: 0,
          wordIndex: 0,
        };
        setBookStream(stream);
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
  }, [activeDocument?.id, updateDocument]);

  const handleViewportPageCount = useCallback((totalPages: number) => {
    if (!activeDocument || activeDocument.kind !== 'markdown-zip') return;
    if (totalPages !== activeDocument.totalPages) {
      updateDocument(activeDocument.id, { totalPages });
    }
  }, [activeDocument, updateDocument]);

  const handleViewportRestore = useCallback((
    nextPage: number,
    localBlockIndex: number,
    wordIndex: number,
  ) => {
    setPageIndex(nextPage);
    setSavedBlockIndex(localBlockIndex);
    setSavedWordIndex(wordIndex);
  }, []);

  const {
    pages: viewportPages,
    pageStarts,
    ready: viewportReady,
    peelOverflowFromPage,
  } = useViewportBookPages({
    stream: bookStream,
    enabled: Boolean(activeDocument?.kind === 'markdown-zip' && bookStream),
    fontScale: preferences.fontScale,
    stageRef: readerStageRef,
    pageBodyRef,
    anchorRef: streamAnchorRef,
    onPageCount: handleViewportPageCount,
    onRestorePage: handleViewportRestore,
  });

  useEffect(() => {
    pageStartsRef.current = pageStarts;
  }, [pageStarts]);

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

  const currentChapterTitle = currentChapterIndex >= 0
    ? locatedChapters[currentChapterIndex]?.title
    : null;

  // Always offer Contents for markdown books — even when detection finds nothing yet.
  const canOpenChapters = activeDocument?.kind === 'markdown-zip';

  useEffect(() => {
    if (!activeDocument || activeDocument.kind !== 'markdown-zip' || !viewportReady) return;
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
  }, [activeDocument?.id, activeDocument?.kind, pageIndex, viewportPages, viewportReady]);

  // After paint: if live prose still overflows the band above the footer,
  // peel enough trailing blocks onto the next page in one shot.
  useLayoutEffect(() => {
    const markdownBook = activeDocument?.kind === 'markdown-zip';
    const preparing = documentLoading
      || (markdownBook && !viewportReady)
      || pageContent.pageIndex !== pageIndex;
    if (!markdownBook || !viewportReady || preparing) return;
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
    activeDocument?.kind,
    documentLoading,
    viewportReady,
    pageContent.pageIndex,
    pageIndex,
    markdownBlocks,
    viewportPages,
    peelOverflowFromPage,
  ]);

  const changePage = useCallback((requestedPage: number, sourceOfChange: PageChangeSource) => {
    if (!activeDocument) return;
    const nextPage = clampPage(requestedPage, activeDocument.totalPages);
    if (sourceOfChange !== 'automatic') tts.stop();
    flushProgress();
    setPageIndex(nextPage);
    setSavedBlockIndex(0);
    setSavedWordIndex(0);
    streamAnchorRef.current = {
      streamIndex: pageStartsRef.current[nextPage] ?? 0,
      wordIndex: 0,
    };
    setPageContent({ pageIndex: -1, blocks: [] });
    setNextPageContent({ pageIndex: -1, blocks: [] });
    setMarkdownBlocks([]);
    updateDocument(activeDocument.id, {
      currentPageIndex: nextPage,
      activeBlockIndex: 0,
      activeWordIndex: 0,
      updatedAt: Date.now(),
    });
  }, [activeDocument, flushProgress, tts.stop, updateDocument]);

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
  }, [flushProgress, tts.stop]);

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
        if (lowerName.endsWith('.zip')) {
          const provisionalName = file.name.replace(/\.(pdf|zip)$/i, '');
          totalPages = (await loadMarkdownBook(file, provisionalName)).length;
        }
        const document = createLibraryDocument(file, totalPages);
        await saveSourceFile(document.id, file);
        await uploadDocumentBlob(document.id, 'source', file);
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

  const importImprovedMmm = useCallback(async () => {
    setImportError(null);
    try {
      const response = await fetch('/samples/mythical-man-month.zip?v=8');
      if (!response.ok) {
        throw new Error('Could not load the improved Mythical Man-Month sample.');
      }
      const blob = await response.blob();
      const file = new File([blob], 'The Mythical Man-Month.zip', { type: 'application/zip' });
      await importFiles([file]);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Sample import failed.');
      setImportOpen(true);
    }
  }, [importFiles]);

  const deleteDocument = useCallback(async (document: LibraryDocument) => {
    if (!window.confirm(`Remove “${document.name}” from this device and the PageEcho server?`)) return;
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
    setInworldServerStatus(status.inworldConfigured ? 'ready' : 'missing-credential');
    setFishAudioServerStatus(status.fishAudioConfigured ? 'ready' : 'missing-credential');
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
    ? calculateProgress(pageIndex, activeDocument.totalPages, displayWordIndex)
    : 0;

  const isMarkdownBook = activeDocument?.kind === 'markdown-zip';
  const pagePreparing = documentLoading
    || (isMarkdownBook && !viewportReady)
    || pageContent.pageIndex !== pageIndex;

  const renderTextPage = (compact = false) => (
    <article
      className={[
        'pe-reading-page',
        compact ? 'is-compact' : '',
        isMarkdownBook ? 'is-viewport-page' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--reader-scale': preferences.fontScale } as React.CSSProperties}
    >
      <header className="pe-page-header">
        <span>{activeDocument?.name}</span>
        <span>{String(pageIndex + 1).padStart(2, '0')} / {String(activeDocument?.totalPages ?? 1).padStart(2, '0')}</span>
      </header>
      <div className="pe-page-body" ref={pageBodyRef}>
        {pagePreparing ? (
          <div className="pe-reader-state">
            <span className="pe-spin" aria-hidden="true">
              <LoaderCircle size={25} />
            </span>
            <strong>Preparing page {pageIndex + 1}</strong>
            <span>Fitting the reading layer to your screen…</span>
          </div>
        ) : pageContent.blocks.some((block) => block.trim()) || markdownBlocks.length ? (
          <ReaderWords
            markdownBlocks={activeDocument?.kind === 'markdown-zip' ? markdownBlocks : undefined}
            plainBlocks={pageContent.blocks}
            activeBlockIndex={displayBlockIndex}
            activeWordIndex={displayWordIndex}
            playbackState={tts.playbackState}
            onWordSelect={(blockIndex, wordIndex) => tts.play(blockIndex, wordIndex)}
          />
        ) : (
          <div className="pe-reader-state">
            <FileText size={26} />
            <strong>No selectable text found</strong>
            <span>Switch to the original PDF view for this page.</span>
          </div>
        )}
      </div>
      <footer className="pe-page-footer">
        <span>PageEcho reading layer</span>
        <span>{Math.round(progress)}% complete</span>
      </footer>
    </article>
  );

  return (
    <div
      className={[
        'pe-app',
        focusActive ? 'is-focus-reading' : '',
        focusActive && chromeVisible ? 'is-chrome-visible' : '',
      ].filter(Boolean).join(' ')}
      data-theme={preferences.appearance}
    >
      <header className="pe-topbar" onPointerDown={onChromePointerDown}>
        <div className="pe-brand">
          <button className="pe-icon-button pe-mobile-only" onClick={() => setLibraryOpen((open) => !open)} aria-label="Toggle library">
            <Menu size={19} />
          </button>
          <span className="pe-brand-mark"><BookOpen size={18} /></span>
          <div>
            <strong>PageEcho</strong>
            <span>Read with every sense</span>
          </div>
        </div>
        <div className="pe-topbar-actions">
          <button className={`pe-sync-pill is-${deviceSyncStatus === 'synced' ? 'connected' : deviceSyncStatus}`} onClick={() => setSettingsOpen(true)}>
            {deviceSyncStatus === 'synced' ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{deviceSyncStatus === 'synced' ? 'Devices synced' : deviceSyncStatus}</span>
          </button>
          <button
            className="pe-icon-button"
            onClick={() => setPreferences((current) => ({
              ...current,
              appearance: current.appearance === 'dark' ? 'light' : 'dark',
            }))}
            aria-label="Toggle color theme"
          >
            {preferences.appearance === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="pe-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <div className="pe-shell">
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
          />
        </div>

        <main className="pe-main">
          {activeDocument ? (
            <>
              <section className="pe-reader-toolbar" onPointerDown={onChromePointerDown}>
                <div className="pe-reader-title">
                  <button className="pe-icon-button pe-mobile-only" onClick={() => setLibraryOpen(true)} aria-label="Open library">
                    <Library size={18} />
                  </button>
                  <div>
                    <span className="pe-eyebrow">
                      {currentChapterTitle
                        || (activeDocument.kind === 'pdf' ? 'PDF document' : 'Markdown edition')}
                    </span>
                    <h1>{activeDocument.name}</h1>
                  </div>
                </div>

                <div className="pe-toolbar-center">
                  <div className="pe-segmented">
                    <button className={readerView === 'reading' ? 'is-active' : ''} onClick={() => setReaderView('reading')}>
                      <FileText size={15} /> Reading
                    </button>
                    {activeDocument.kind === 'pdf' ? (
                      <button className={readerView === 'original' ? 'is-active' : ''} onClick={() => setReaderView('original')}>
                        <BookOpen size={15} /> Original
                      </button>
                    ) : (
                      <button className={readerView === 'parallel' ? 'is-active' : ''} onClick={() => setReaderView('parallel')}>
                        <Columns2 size={15} /> Parallel
                      </button>
                    )}
                  </div>
                </div>

                <div className="pe-toolbar-actions">
                  {activeDocument.kind === 'markdown-zip' && (
                    <label className="pe-button pe-button-secondary">
                      {pairBusy ? <LoaderCircle className="pe-spin" size={16} /> : <Link2 size={16} />}
                      <span>{pairedPdf ? 'Replace PDF' : 'Pair original PDF'}</span>
                      <input
                        className="pe-visually-hidden"
                        type="file"
                        accept=".pdf,application/pdf"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) pairOriginalPdf(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  <button className="pe-icon-button" aria-label="More options"><MoreHorizontal size={18} /></button>
                </div>
              </section>

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
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex + 1, 'manual')} disabled={pageIndex + 1 >= activeDocument.totalPages} aria-label="Next page">
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
                    <button className="pe-button pe-button-primary" onClick={() => setImportOpen(true)}>
                      <Upload size={16} /> Import another file
                    </button>
                  </div>
                ) : readerView === 'original' && activeDocument.kind === 'pdf' && source ? (
                  <div className="pe-single-pdf">
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
                  </div>
                ) : readerView === 'parallel' && activeDocument.kind === 'markdown-zip' ? (
                  pairedPdf ? (
                    <div className="pe-parallel">
                      <div className="pe-pane">{renderTextPage(true)}</div>
                      <div className="pe-pane pe-pane-pdf">
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
                  <div className="pe-reading-wrap">
                    {renderTextPage()}
                  </div>
                )}

                {activeDocument.kind === 'pdf' && readerView !== 'original' && source && (
                  <div className="pe-extractor" aria-hidden="true">
                    <BimodalPDFViewer
                      pdfUrl={source}
                      pageIndex={pageIndex}
                      activeBlockIndex={null}
                      activeWordIndex={null}
                      scale={1}
                      onTextExtracted={handlePdfTextExtracted}
                      onNextPageTextExtracted={handleNextPdfTextExtracted}
                      onWordTap={() => undefined}
                      onPageLoadSuccess={handlePdfLoaded}
                    />
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
                    <strong>{preferences.fishAudioEnabled ? `Fish Audio (${preferences.fishAudioVoiceId})` : preferences.inworldEnabled ? `Inworld (${preferences.inworldVoiceId})` : 'System voice'}</strong>
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
                  <button className="pe-icon-button" onClick={() => changePage(pageIndex + 1, 'manual')} disabled={pageIndex + 1 >= activeDocument.totalPages} aria-label="Next page">
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
            <section className="pe-welcome">
              <div className="pe-welcome-copy">
                <span className="pe-eyebrow">A calmer way to read and listen</span>
                <h1>Your documents,<br />in perfect cadence.</h1>
                <p>Import PDFs or page-by-page Markdown books. PageEcho keeps your place, speaks every passage, and follows each word without losing the page.</p>
                <div className="pe-welcome-actions">
                  <button className="pe-button pe-button-primary" onClick={() => setImportOpen(true)}>
                    <Plus size={17} /> Add your first book
                  </button>
                  <button
                    className="pe-button pe-button-secondary"
                    onClick={() => { void importImprovedMmm(); }}
                    disabled={importBusy}
                  >
                    {importBusy ? <LoaderCircle className="pe-spin" size={17} /> : <BookOpen size={17} />}
                    Try Mythical Man-Month
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
          )}
        </main>
      </div>

      <ImportDialog
        open={importOpen}
        busy={importBusy}
        error={importError}
        onClose={() => setImportOpen(false)}
        onImport={importFiles}
        onImportSample={() => { void importImprovedMmm(); }}
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
        onChange={setPreferences}
        onSaveSecrets={handleSaveSecrets}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
