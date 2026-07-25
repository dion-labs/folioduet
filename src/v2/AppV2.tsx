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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BimodalPDFViewer } from '../components/BimodalPDFViewer';
import type { MarkdownBlock } from '../hooks/useTTS';
import { BimodalSyncEngine, type ProgressState } from '../utils/BimodalSyncEngine';
import { calculateProgress, extractMarkdownPages, prepareMarkdownPage } from './documents';
import { ImportDialog } from './components/ImportDialog';
import { LibrarySidebar } from './components/LibrarySidebar';
import { ReaderWords } from './components/ReaderWords';
import { SettingsPanel } from './components/SettingsPanel';
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
import type {
  LibraryDocument,
  PageContent,
  ReaderPreferences,
  ReaderView,
  SyncStatus,
} from './types';
import { useContinuousTTS } from './useContinuousTTS';
import './styles.css';

type PageChangeSource = 'manual' | 'automatic' | 'remote';

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
  const [zipPages, setZipPages] = useState<string[] | null>(null);
  const [source, setSource] = useState<File | string | null>(null);
  const [pairedPdf, setPairedPdf] = useState<File | null>(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [documentError, setDocumentError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<ReaderPreferences>(loadPreferences);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [pairBusy, setPairBusy] = useState(false);

  const syncEngineRef = useRef<BimodalSyncEngine | null>(null);
  const pageChangeRef = useRef<(nextPage: number, source: PageChangeSource) => void>(() => undefined);
  const remoteProgressRef = useRef<(state: ProgressState) => void>(() => undefined);
  const pendingProgressRef = useRef<PendingProgress | null>(null);
  const progressTimerRef = useRef<number | null>(null);

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
    pendingProgressRef.current = {
      documentId: activeDocumentId,
      pageIndex,
      blockIndex,
      wordIndex,
    };
    if (progressTimerRef.current === null) {
      progressTimerRef.current = window.setTimeout(flushProgress, 450);
    }
    syncEngineRef.current?.updateLocalProgress(pageIndex, blockIndex, wordIndex);
  }, [activeDocumentId, flushProgress, pageIndex]);

  const ttsConfig = useMemo(() => ({
    rate: preferences.playbackRate,
    volume: preferences.volume,
    inworldEnabled: preferences.inworldEnabled,
    inworldApiKey: preferences.inworldApiKey,
    inworldVoiceId: preferences.inworldVoiceId,
  }), [
    preferences.inworldApiKey,
    preferences.inworldEnabled,
    preferences.inworldVoiceId,
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
    setZipPages(null);
    setPairedPdf(null);
    setSource(null);
    setPageContent({ pageIndex: -1, blocks: [] });
    setNextPageContent({ pageIndex: -1, blocks: [] });
    setMarkdownBlocks([]);

    if (!activeDocument) return () => { active = false; };

    setDocumentLoading(true);
    Promise.all([
      loadSourceFile(activeDocument),
      activeDocument.kind === 'markdown-zip' ? loadPairedPdf(activeDocument.id) : Promise.resolve(null),
    ]).then(async ([loadedSource, loadedPair]) => {
      if (!active) return;
      if (!loadedSource) {
        throw new Error('The original file is no longer available on this device.');
      }

      setSource(loadedSource);
      setPairedPdf(loadedPair);
      if (activeDocument.kind === 'markdown-zip') {
        if (!(loadedSource instanceof File)) {
          throw new Error('This Markdown archive cannot be read from its stored source.');
        }
        const pages = await extractMarkdownPages(loadedSource);
        if (!active) return;
        setZipPages(pages);
        if (pages.length !== activeDocument.totalPages) {
          updateDocument(activeDocument.id, { totalPages: pages.length });
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
  }, [activeDocument?.id, updateDocument]);

  useEffect(() => {
    if (!activeDocument || activeDocument.kind !== 'markdown-zip' || !zipPages) return;
    const nextPageIndex = clampPage(pageIndex, zipPages.length);
    const markdown = zipPages[nextPageIndex];
    if (markdown === undefined) return;
    const prepared = prepareMarkdownPage(markdown, activeDocument.name);
    setMarkdownBlocks(prepared.renderedBlocks);
    setPageContent({ pageIndex: nextPageIndex, blocks: prepared.speakableBlocks });

    const nextMarkdown = zipPages[nextPageIndex + 1];
    setNextPageContent(nextMarkdown === undefined
      ? { pageIndex: -1, blocks: [] }
      : {
          pageIndex: nextPageIndex + 1,
          blocks: prepareMarkdownPage(nextMarkdown, activeDocument.name).speakableBlocks,
        });
  }, [activeDocument?.id, activeDocument?.kind, activeDocument?.name, pageIndex, zipPages]);

  const changePage = useCallback((requestedPage: number, sourceOfChange: PageChangeSource) => {
    if (!activeDocument) return;
    const nextPage = clampPage(requestedPage, activeDocument.totalPages);
    if (sourceOfChange !== 'automatic') tts.stop();
    flushProgress();
    setPageIndex(nextPage);
    setSavedBlockIndex(0);
    setSavedWordIndex(0);
    setPageContent({ pageIndex: -1, blocks: [] });
    setNextPageContent({ pageIndex: -1, blocks: [] });
    setMarkdownBlocks([]);
    updateDocument(activeDocument.id, {
      currentPageIndex: nextPage,
      activeBlockIndex: 0,
      activeWordIndex: 0,
      updatedAt: Date.now(),
    });
    syncEngineRef.current?.updateLocalProgress(nextPage, 0, 0, true);
    if (sourceOfChange !== 'remote') setLastSyncedAt(Date.now());
  }, [activeDocument, flushProgress, tts.stop, updateDocument]);

  useEffect(() => {
    pageChangeRef.current = changePage;
  }, [changePage]);

  useEffect(() => {
    remoteProgressRef.current = (state) => {
      if (!activeDocument || state.document_id !== activeDocument.id) return;
      tts.stop();
      flushProgress();
      const remotePage = clampPage(state.page_index, activeDocument.totalPages);
      setPageIndex(remotePage);
      setSavedBlockIndex(state.block_index);
      setSavedWordIndex(state.word_index);
      setPageContent({ pageIndex: -1, blocks: [] });
      setNextPageContent({ pageIndex: -1, blocks: [] });
      updateDocument(activeDocument.id, {
        currentPageIndex: remotePage,
        activeBlockIndex: state.block_index,
        activeWordIndex: state.word_index,
        updatedAt: Date.now(),
      });
      setLastSyncedAt(Date.now());
    };
  }, [activeDocument, flushProgress, tts.stop, updateDocument]);

  useEffect(() => {
    syncEngineRef.current?.stop();
    syncEngineRef.current = null;

    if (!activeDocument || !preferences.syncEnabled) {
      setSyncStatus('disabled');
      return;
    }

    if (!window.nostr) {
      setSyncStatus('needs-signer');
      return;
    }

    let cancelled = false;
    setSyncStatus('connecting');
    window.nostr.getPublicKey().then((pubkey) => {
      if (cancelled || !window.nostr) return;
      const engine = new BimodalSyncEngine({
        relayUrl: preferences.relayUrl,
        userPubkey: pubkey,
        signEvent: (event) => window.nostr!.signEvent(event),
        onRemoteProgressApplied: (state) => remoteProgressRef.current(state),
        onConnectionStatusChange: (status) => {
          if (!cancelled) setSyncStatus(status);
        },
      });
      syncEngineRef.current = engine;
      return engine.start(activeDocument.id);
    }).catch(() => {
      if (!cancelled) setSyncStatus('error');
    });

    return () => {
      cancelled = true;
      syncEngineRef.current?.stop();
      syncEngineRef.current = null;
    };
  }, [activeDocument?.id, preferences.relayUrl, preferences.syncEnabled]);

  const selectDocument = useCallback((document: LibraryDocument) => {
    tts.stop();
    flushProgress();
    setActiveDocumentId(document.id);
    setPageIndex(clampPage(document.currentPageIndex, document.totalPages));
    setSavedBlockIndex(document.activeBlockIndex);
    setSavedWordIndex(document.activeWordIndex);
    setReaderView('reading');
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
          totalPages = (await extractMarkdownPages(file)).length;
        }
        const document = createLibraryDocument(file, totalPages);
        await saveSourceFile(document.id, file);
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

  const deleteDocument = useCallback(async (document: LibraryDocument) => {
    if (!window.confirm(`Remove “${document.name}” and its local files from this device?`)) return;
    if (activeDocumentId === document.id) {
      tts.stop();
      setActiveDocumentId(null);
      setSource(null);
      setPairedPdf(null);
    }
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    await deleteDocumentFiles(document.id);
  }, [activeDocumentId, tts.stop]);

  const pairOriginalPdf = useCallback(async (file: File) => {
    if (!activeDocument || activeDocument.kind !== 'markdown-zip') return;
    setPairBusy(true);
    try {
      await savePairedPdf(activeDocument.id, file);
      setPairedPdf(file);
      updateDocument(activeDocument.id, { pairedPdfName: file.name, updatedAt: Date.now() });
      setReaderView('parallel');
    } finally {
      setPairBusy(false);
    }
  }, [activeDocument, updateDocument]);

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

  const handlePause = () => {
    tts.pause();
    flushProgress();
  };
  const handleStop = () => {
    tts.stop();
    flushProgress();
    syncEngineRef.current?.updateLocalProgress(pageIndex, savedBlockIndex, savedWordIndex, true);
  };

  const displayBlockIndex = tts.isPlaying && tts.activeBlockIndex >= 0 ? tts.activeBlockIndex : savedBlockIndex;
  const displayWordIndex = tts.isPlaying && tts.activeWordIndex >= 0 ? tts.activeWordIndex : savedWordIndex;
  const progress = activeDocument
    ? calculateProgress(pageIndex, activeDocument.totalPages, displayWordIndex)
    : 0;
  const hasSigner = typeof window !== 'undefined' && Boolean(window.nostr);

  const renderTextPage = (compact = false) => (
    <article
      className={`pe-reading-page ${compact ? 'is-compact' : ''}`}
      style={{ '--reader-scale': preferences.fontScale } as React.CSSProperties}
    >
      <header className="pe-page-header">
        <span>{activeDocument?.name}</span>
        <span>{String(pageIndex + 1).padStart(2, '0')} / {String(activeDocument?.totalPages ?? 1).padStart(2, '0')}</span>
      </header>
      <div className="pe-page-body">
        {documentLoading || pageContent.pageIndex !== pageIndex ? (
          <div className="pe-reader-state">
            <LoaderCircle className="pe-spin" size={25} />
            <strong>Preparing page {pageIndex + 1}</strong>
            <span>Extracting the reading layer…</span>
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
    <div className="pe-app" data-theme={preferences.appearance}>
      <header className="pe-topbar">
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
          <button className={`pe-sync-pill is-${syncStatus}`} onClick={() => setSettingsOpen(true)}>
            {syncStatus === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{syncStatus === 'connected' ? 'Progress synced' : syncStatus.replace('-', ' ')}</span>
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
              <section className="pe-reader-toolbar">
                <div className="pe-reader-title">
                  <button className="pe-icon-button pe-mobile-only" onClick={() => setLibraryOpen(true)} aria-label="Open library">
                    <Library size={18} />
                  </button>
                  <div>
                    <span className="pe-eyebrow">{activeDocument.kind === 'pdf' ? 'PDF document' : 'Markdown edition'}</span>
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

              <section className="pe-reader-nav">
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

              <section className="pe-reader-stage">
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

              <section className="pe-playback-dock" aria-label="Playback controls">
                <div className="pe-playback-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="pe-playback-info">
                  <span className="pe-audio-art"><Volume2 size={18} /></span>
                  <div>
                    <strong>{preferences.inworldEnabled && preferences.inworldApiKey ? preferences.inworldVoiceId : 'System voice'}</strong>
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
                      onClick={() => tts.isPaused ? tts.resume() : tts.play(savedBlockIndex, savedWordIndex)}
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
                  <a className="pe-button pe-button-secondary" href="/">View the original prototype</a>
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
      />
      <SettingsPanel
        open={settingsOpen}
        preferences={preferences}
        syncStatus={syncStatus}
        hasNostrSigner={hasSigner}
        onChange={setPreferences}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
