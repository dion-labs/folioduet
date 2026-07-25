import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  ChevronLeft, 
  ChevronRight, 
  Upload, 
  BookOpen, 
  Settings, 
  Wifi, 
  WifiOff, 
  Plus, 
  Trash2, 
  FileText, 
  Sliders, 
  Volume2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  AlignLeft,
  Sun,
  Moon
} from 'lucide-react';
import JSZip from 'jszip';
import { BimodalPDFViewer } from './components/BimodalPDFViewer';
import { useTTS, tokenizeBlock, parsePageMarkdown, MarkdownBlock } from './hooks/useTTS';
import { BimodalSyncEngine, ProgressState } from './utils/BimodalSyncEngine';
import { pdfStore } from './utils/PDFStore';

interface DocumentMetadata {
  id: string;
  name: string;
  url: string;
  totalPages: number;
  currentPageIndex: number;
  activeBlockIndex: number;
  activeWordIndex: number;
  updatedAt: number;
  isSample?: boolean;
  isZip?: boolean;
}

const DEFAULT_SAMPLE_PDF = {
  id: 'sample-tracemonkey',
  name: 'TraceMonkey: JavaScript Performance (Sample)',
  url: 'https://raw.githubusercontent.com/mozilla/pdf.js/master/web/compressed.tracemonkey-pldi-09.pdf',
  totalPages: 14,
  currentPageIndex: 0,
  activeBlockIndex: 0,
  activeWordIndex: 0,
  updatedAt: Date.now(),
  isSample: true,
};

export default function App() {
  // =========================================================================
  // State Management
  // =========================================================================
  
  const [documents, setDocuments] = useState<DocumentMetadata[]>(() => {
    const saved = localStorage.getItem('bimodal-library');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved library:', e);
      }
    }
    return [DEFAULT_SAMPLE_PDF];
  });

  const [activeDocId, setActiveDocId] = useState<string | null>(() => {
    return localStorage.getItem('bimodal-active-doc') || null;
  });

  const activeDoc = documents.find(d => d.id === activeDocId) || null;

  const [pageIndex, setPageIndex] = useState(() => {
    return activeDoc ? activeDoc.currentPageIndex : 0;
  });

  const [activeBlockIndex, setActiveBlockIndex] = useState<number | null>(() => {
    return activeDoc ? activeDoc.activeBlockIndex : null;
  });

  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(() => {
    return activeDoc ? activeDoc.activeWordIndex : null;
  });

  const [scale, setScale] = useState(1.2);
  const [readerMode, setReaderMode] = useState<'document' | 'pdf' | 'side-by-side'>(() => {
    const saved = localStorage.getItem('bimodal-reader-mode');
    return (saved === 'pdf' || saved === 'document' || saved === 'side-by-side') ? saved : 'document';
  });
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('bimodal-dark-mode');
    return saved ? saved === 'true' : true;
  });
  const [showTextPanel, setShowTextPanel] = useState(() => {
    const saved = localStorage.getItem('bimodal-show-text-panel');
    return saved ? saved === 'true' : true;
  });
  const [blocks, setBlocks] = useState<string[]>([]);
  const [zipPages, setZipPages] = useState<string[] | null>(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [zipFetchLoading, setZipFetchLoading] = useState(false);
  const [loadedZipDocId, setLoadedZipDocId] = useState<string | null>(null);
  const [pairedPdfFile, setPairedPdfFile] = useState<File | null>(null);
  const [markdownBlocks, setMarkdownBlocks] = useState<MarkdownBlock[]>([]);
  const [totalPages, setTotalPages] = useState(activeDoc ? activeDoc.totalPages : 1);
  const [fileObjects, setFileObjects] = useState<Record<string, File>>({});

  // Load active PDF File from IndexedDB on active document change or page load
  useEffect(() => {
    if (activeDocId && activeDocId !== DEFAULT_SAMPLE_PDF.id) {
      pdfStore.getFile(activeDocId).then(file => {
        if (file) {
          setFileObjects(prev => {
            if (prev[activeDocId] === file) return prev;
            return { ...prev, [activeDocId]: file };
          });
        }
      }).catch(err => {
        console.error('Failed to load PDF from IndexedDB store:', err);
      });
    }
  }, [activeDocId]);

  // Extract and load ZIP Markdown content
  const loadZipDocument = useCallback(async (id: string, file: File) => {
    setZipLoading(true);
    try {
      console.log('🐝 [App.tsx] Starting ZIP file extraction via JSZip...');
      const zip = await JSZip.loadAsync(file);
      const markdownFiles = Object.keys(zip.files)
        .filter(name => name.toLowerCase().endsWith('.md'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      console.log(`🐝 [App.tsx] Found ${markdownFiles.length} markdown files in ZIP.`);
      const extractedPages: string[] = [];
      for (const fileName of markdownFiles) {
        const text = await zip.files[fileName].async('string');
        extractedPages.push(text);
      }

      setZipPages(extractedPages);
      setTotalPages(extractedPages.length);
      setLoadedZipDocId(id);

      // Update total pages and format in state and documents list
      setDocuments(prev => prev.map(doc => {
        if (doc.id === id) {
          return { ...doc, totalPages: extractedPages.length, isZip: true };
        }
        return doc;
      }));
    } catch (err) {
      console.error('Failed to load ZIP file:', err);
    } finally {
      setZipLoading(false);
    }
  }, []);

  // Load ZIP Markdown content on active document change or file cache load
  useEffect(() => {
    if (!activeDocId) {
      setZipPages(null);
      setLoadedZipDocId(null);
      return;
    }

    if (loadedZipDocId === activeDocId) {
      // Already loaded! Avoid infinite loops.
      return;
    }

    const doc = documentsRef.current.find(d => d.id === activeDocId);
    if (!doc) {
      setZipPages(null);
      setLoadedZipDocId(null);
      return;
    }

    const isZipFile = doc.isZip || doc.name.endsWith('.zip');
    if (isZipFile) {
      const cachedFile = fileObjects[activeDocId];
      if (cachedFile) {
        loadZipDocument(activeDocId, cachedFile);
      } else if (activeDocId !== DEFAULT_SAMPLE_PDF.id) {
        setZipLoading(true);
        pdfStore.getFile(activeDocId).then(file => {
          if (file) {
            setFileObjects(prev => ({ ...prev, [activeDocId]: file }));
            loadZipDocument(activeDocId, file);
          } else {
            setZipLoading(false);
          }
        }).catch(err => {
          console.error('Failed to load ZIP from IndexedDB store:', err);
          setZipLoading(false);
        });
      }
    } else {
      setZipPages(null);
      setLoadedZipDocId(null);
    }
  }, [activeDocId, loadedZipDocId, fileObjects, loadZipDocument]);

  // Parse current ZIP page whenever zipPages or pageIndex changes
  useEffect(() => {
    if (zipPages && zipPages[pageIndex] !== undefined) {
      console.log(`🐝 [App.tsx] Parsing markdown for ZIP page index ${pageIndex}`);
      const parsed = parsePageMarkdown(zipPages[pageIndex]);
      setMarkdownBlocks(parsed);
      
      const activeDocObj = documentsRef.current.find(d => d.id === activeDocId);
      const docNameClean = activeDocObj?.name 
        ? activeDocObj.name.toLowerCase().replace(/\s*\(markdown zip\)\s*/i, '').trim() 
        : '';

      // Skip book title headers and page number blocks from being read by TTS
      const speakableBlocks = parsed.map(b => {
        const textLower = b.text.toLowerCase().trim();
        const isPageNum = /^page\s+\d+$/i.test(textLower);
        const isBookHeader = textLower.includes('addison-wesley') || 
                             textLower.includes('the mythical man-month') ||
                             (docNameClean && textLower.includes(docNameClean));
        
        return (isPageNum || isBookHeader) ? "" : b.text;
      });

      setBlocks(speakableBlocks);
    } else {
      setMarkdownBlocks([]);
    }
  }, [zipPages, pageIndex, activeDocId]);

  // Load paired PDF file from IndexedDB on active document change
  useEffect(() => {
    const activeDocObj = documentsRef.current.find(d => d.id === activeDocId);
    if (activeDocId && activeDocObj?.isZip) {
      console.log(`🐝 [App.tsx] Attempting to load paired PDF for ZIP ID: ${activeDocId}`);
      pdfStore.getFile(`${activeDocId}-paired-pdf`).then(file => {
        if (file) {
          console.log(`🐝 [App.tsx] Paired PDF loaded successfully: ${file.name}`);
          setPairedPdfFile(file);
        } else {
          setPairedPdfFile(null);
        }
      }).catch(err => {
        console.error('Failed to load paired PDF from IndexedDB store:', err);
        setPairedPdfFile(null);
      });
    } else {
      setPairedPdfFile(null);
    }
  }, [activeDocId]);

  // TTS Configuration State
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1.0);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('bimodal-tts-volume');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Nostr Sync State
  const [nostrEnabled, setNostrEnabled] = useState(() => {
    const saved = localStorage.getItem('bimodal-nostr-enabled');
    return saved ? saved === 'true' : true;
  });

  const [relayUrl, setRelayUrl] = useState(() => {
    return localStorage.getItem('bimodal-relay-url') || 'wss://relay.damus.io';
  });

  const [userPubkey, setUserPubkey] = useState(() => {
    let saved = localStorage.getItem('bimodal-user-pubkey');
    if (!saved) {
      // Generate a random 32-byte hex string for pubkey
      saved = Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      localStorage.setItem('bimodal-user-pubkey', saved);
    }
    return saved;
  });

  const [syncStatus, setSyncStatus] = useState<'disabled' | 'connecting' | 'connected' | 'error'>('disabled');
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'sync' | 'tts'>('sync');

  // Inworld TTS State
  const [inworldEnabled, setInworldEnabled] = useState(() => {
    const saved = localStorage.getItem('bimodal-inworld-enabled');
    return saved ? saved === 'true' : false;
  });

  const [inworldApiKey, setInworldApiKey] = useState(() => {
    return localStorage.getItem('bimodal-inworld-apikey') || '';
  });

  const [inworldVoiceId, setInworldVoiceId] = useState(() => {
    return localStorage.getItem('bimodal-inworld-voiceid') || 'Ashley';
  });

  // Remote progress application state
  const [remoteProgressToApply, setRemoteProgressToApply] = useState<{
    blockIndex: number;
    wordIndex: number;
  } | null>(null);

  // Refs for tracking state inside callbacks without stale closures
  const pageIndexRef = useRef(pageIndex);
  const activeBlockIndexRef = useRef(activeBlockIndex);
  const activeWordIndexRef = useRef(activeWordIndex);
  const syncEngineRef = useRef<BimodalSyncEngine | null>(null);
  const documentsRef = useRef(documents);
  const activeDocRef = useRef(activeDoc);

  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);
  useEffect(() => { activeBlockIndexRef.current = activeBlockIndex; }, [activeBlockIndex]);
  useEffect(() => { activeWordIndexRef.current = activeWordIndex; }, [activeWordIndex]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);
  useEffect(() => { activeDocRef.current = activeDoc; }, [activeDoc]);

  // Save library to localStorage on change
  useEffect(() => {
    localStorage.setItem('bimodal-library', JSON.stringify(documents));
  }, [documents]);

  // Save active document ID to localStorage
  useEffect(() => {
    if (activeDocId) {
      localStorage.setItem('bimodal-active-doc', activeDocId);
    } else {
      localStorage.removeItem('bimodal-active-doc');
    }
  }, [activeDocId]);

  // Save Nostr settings to localStorage
  useEffect(() => {
    localStorage.setItem('bimodal-nostr-enabled', String(nostrEnabled));
    localStorage.setItem('bimodal-relay-url', relayUrl);
  }, [nostrEnabled, relayUrl]);

  // Save Inworld settings to localStorage
  useEffect(() => {
    localStorage.setItem('bimodal-inworld-enabled', String(inworldEnabled));
    localStorage.setItem('bimodal-inworld-apikey', inworldApiKey);
    localStorage.setItem('bimodal-inworld-voiceid', inworldVoiceId);
  }, [inworldEnabled, inworldApiKey, inworldVoiceId]);

  // Synchronize dark class on document element and localStorage
  useEffect(() => {
    localStorage.setItem('bimodal-dark-mode', String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Force document mode for ZIP files if not side-by-side
  useEffect(() => {
    const currentActiveDoc = documentsRef.current.find(d => d.id === activeDocId);
    if (currentActiveDoc && currentActiveDoc.isZip) {
      if (readerMode === 'pdf') {
        setReaderMode('document');
      }
    }
  }, [activeDocId, readerMode]);

  // Load available voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Select default English voice
      if (!selectedVoice) {
        const defaultVoice = 
          availableVoices.find(v => v.lang.startsWith('en') && v.localService) ||
          availableVoices.find(v => v.lang.startsWith('en')) ||
          availableVoices[0] || 
          null;
        setSelectedVoice(defaultVoice);
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, [selectedVoice]);

  // =========================================================================
  // useTTS Hook Integration
  // =========================================================================
  
  const handlePageChangeRef = useRef<((newPageIndex: number) => void) | null>(null);
  const stopTTSRef = useRef<(() => void) | null>(null);

  const handlePageTurn = useCallback(() => {
    console.log("🐝 [App.tsx] handlePageTurn callback triggered. pageIndex:", pageIndex, "totalPages:", totalPages);
    if (pageIndex + 1 < totalPages) {
      console.log('Auto-advancing to next page... 🐝');
      handlePageChangeRef.current?.(pageIndex + 1);
    } else {
      console.log('Reached the end of the document! 🍯');
      stopTTSRef.current?.();
      setActiveBlockIndex(null);
      setActiveWordIndex(null);
    }
  }, [pageIndex, totalPages]);

  const handlePositionUpdate = useCallback((blockIdx: number, wordIdx: number) => {
    setActiveBlockIndex(blockIdx);
    setActiveWordIndex(wordIdx);

    // Update document metadata with current progress
    if (activeDocId) {
      setDocuments(prev => prev.map(doc => {
        if (doc.id === activeDocId) {
          return {
            ...doc,
            currentPageIndex: pageIndex,
            activeBlockIndex: blockIdx,
            activeWordIndex: wordIdx,
            updatedAt: Date.now(),
          };
        }
        return doc;
      }));
    }

    // Push update to Nostr Sync Engine
    if (syncEngineRef.current) {
      syncEngineRef.current.updateLocalProgress(pageIndex, blockIdx, wordIdx);
      setLastSynced(new Date().toLocaleTimeString());
    }
  }, [activeDocId, pageIndex]);

  const {
    isPlaying,
    isPaused,
    play,
    pause,
    resume,
    stop: stopTTS,
    updateConfig,
  } = useTTS({
    blocks,
    pageIndex,
    onPageTurn: handlePageTurn,
    onPositionUpdate: handlePositionUpdate,
    initialVoice: selectedVoice,
    initialRate: rate,
  });

  useEffect(() => {
    stopTTSRef.current = stopTTS;
  }, [stopTTS]);

  const handleStop = useCallback(() => {
    console.log("🐝 [App.tsx] handleStop called. Invoking stopTTS().");
    stopTTS();
  }, [stopTTS]);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    localStorage.setItem('bimodal-tts-volume', newVolume.toString());
  };

  // Keep TTS engine config in sync with UI controls
  useEffect(() => {
    updateConfig({ 
      voice: selectedVoice, 
      rate, 
      volume,
      inworldEnabled,
      inworldApiKey,
      inworldVoiceId,
    });
  }, [selectedVoice, rate, volume, inworldEnabled, inworldApiKey, inworldVoiceId, updateConfig]);

  // =========================================================================
  // Nostr Sync Engine Integration
  // =========================================================================

  useEffect(() => {
    if (!activeDocId || !nostrEnabled) {
      if (syncEngineRef.current) {
        syncEngineRef.current.stop();
        syncEngineRef.current = null;
      }
      setSyncStatus('disabled');
      return;
    }

    setSyncStatus('connecting');

    const engine = new BimodalSyncEngine({
      relayUrl,
      userPubkey,
      signEvent: async (event) => {
        return {
          ...event,
          pubkey: userPubkey,
          sig: 'mock_sig_' + Math.random().toString(36).substring(2, 15),
        };
      },
      onRemoteProgressApplied: (state) => {
        // Only apply if it's actually a different position to avoid loops
        if (
          state.page_index !== pageIndexRef.current ||
          state.block_index !== activeBlockIndexRef.current ||
          state.word_index !== activeWordIndexRef.current
        ) {
          console.log(`Applying remote progress: Page ${state.page_index}, Block ${state.block_index}, Word ${state.word_index} 🐝✨`);
          setPageIndex(state.page_index);
          setRemoteProgressToApply({
            blockIndex: state.block_index,
            wordIndex: state.word_index,
          });
        }
        setLastSynced(new Date().toLocaleTimeString());
        setSyncStatus('connected');
      },
    });

    syncEngineRef.current = engine;
    engine.start(activeDocId);

    // Monitor connection status
    const interval = setInterval(() => {
      if (syncEngineRef.current) {
        const isConnected = (syncEngineRef.current as any).isConnected;
        setSyncStatus(isConnected ? 'connected' : 'connecting');
      }
    }, 1500);

    return () => {
      clearInterval(interval);
      engine.stop();
      syncEngineRef.current = null;
    };
  }, [activeDocId, nostrEnabled, relayUrl, userPubkey]);

  // =========================================================================
  // UI Event Handlers
  // =========================================================================

  const handlePageChange = (newPageIndex: number) => {
    if (newPageIndex < 0 || newPageIndex >= totalPages) return;
    
    stopTTS();
    setPageIndex(newPageIndex);
    setActiveBlockIndex(0);
    setActiveWordIndex(0);

    // Update document metadata
    if (activeDocId) {
      setDocuments(prev => prev.map(doc => {
        if (doc.id === activeDocId) {
          return {
            ...doc,
            currentPageIndex: newPageIndex,
            activeBlockIndex: 0,
            activeWordIndex: 0,
            updatedAt: Date.now(),
          };
        }
        return doc;
      }));
    }

    // Force immediate remote publish on manual page change
    if (syncEngineRef.current) {
      syncEngineRef.current.updateLocalProgress(newPageIndex, 0, 0, true);
      setLastSynced(new Date().toLocaleTimeString());
    }
  };

  useEffect(() => {
    handlePageChangeRef.current = handlePageChange;
  }, [handlePageChange]);

  const handleTextExtracted = useCallback((extractedBlocks: string[]) => {
    setBlocks(extractedBlocks);
    
    // If we have a pending remote progress update, apply it now that text is extracted!
    if (remoteProgressToApply) {
      const { blockIndex, wordIndex } = remoteProgressToApply;
      setRemoteProgressToApply(null);
      
      setActiveBlockIndex(blockIndex);
      setActiveWordIndex(wordIndex);
      
      // Update local metadata
      if (activeDocId) {
        setDocuments(prev => prev.map(doc => {
          if (doc.id === activeDocId) {
            return {
              ...doc,
              currentPageIndex: pageIndexRef.current,
              activeBlockIndex: blockIndex,
              activeWordIndex: wordIndex,
              updatedAt: Date.now(),
            };
          }
          return doc;
        }));
      }
    }
  }, [remoteProgressToApply, activeDocId]);

  const handleWordTap = useCallback((blockIdx: number, wordIdx: number) => {
    console.log(`Tapped word: Block ${blockIdx}, Word ${wordIdx}. Seeking... 🐝`);
    play(blockIdx, wordIdx);
  }, [play]);

  const handlePageLoadSuccess = useCallback((numPages: number) => {
    setTotalPages(numPages);
    if (activeDocId) {
      setDocuments(prev => prev.map(doc => {
        if (doc.id === activeDocId) {
          return { ...doc, totalPages: numPages };
        }
        return doc;
      }));
    }
  }, [activeDocId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const id = 'doc-' + Date.now();
    const url = URL.createObjectURL(file);
    const isZip = file.name.toLowerCase().endsWith('.zip');

    try {
      await pdfStore.saveFile(id, file);
    } catch (err) {
      console.error('Failed to save file to IndexedDB store:', err);
    }

    const newDoc: DocumentMetadata = {
      id,
      name: file.name,
      url,
      totalPages: 1,
      currentPageIndex: 0,
      activeBlockIndex: 0,
      activeWordIndex: 0,
      updatedAt: Date.now(),
      isZip,
    };

    setFileObjects(prev => ({ ...prev, [id]: file }));
    setDocuments(prev => [newDoc, ...prev]);
    handleSelectDocument(newDoc);
  };

  const handleSelectDocument = (doc: DocumentMetadata) => {
    setActiveDocId(doc.id);
    setPageIndex(doc.currentPageIndex);
    setActiveBlockIndex(doc.activeBlockIndex);
    setActiveWordIndex(doc.activeWordIndex);
    setTotalPages(doc.totalPages || 1);
    setBlocks([]);
    stopTTS();
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this document from your library?')) {
      setDocuments(prev => prev.filter(d => d.id !== id));
      
      // Delete from IndexedDB PDF store
      pdfStore.deleteFile(id).catch(err => {
        console.error('Failed to delete PDF from IndexedDB store:', err);
      });

      // Delete paired PDF if any
      pdfStore.deleteFile(`${id}-paired-pdf`).catch(err => {
        console.error('Failed to delete paired PDF from IndexedDB store:', err);
      });

      if (activeDocId === id) {
        setActiveDocId(null);
        setActiveBlockIndex(null);
        setActiveWordIndex(null);
        stopTTS();
      }
    }
  };

  const handleLoadSample = () => {
    if (!documents.some(d => d.id === DEFAULT_SAMPLE_PDF.id)) {
      setDocuments(prev => [...prev, DEFAULT_SAMPLE_PDF]);
    }
    handleSelectDocument(DEFAULT_SAMPLE_PDF);
  };

  const handleLoadSampleZip = async () => {
    const id = 'sample-mythical-man-month-zip';
    const sampleUrl = 'http://localhost:3000/media/1c5f62506bbf62c83b0a4cc11e02d9b3091462693df7fca159ed9f62fd55cb1c.zip';

    const existing = documents.find(d => d.id === id);
    if (existing) {
      handleSelectDocument(existing);
      return;
    }

    setZipFetchLoading(true);
    try {
      console.log('🐝 [App.tsx] Fetching Mythical Man-Month ZIP archive from local server...');
      const response = await fetch(sampleUrl);
      if (!response.ok) {
        throw new Error(`Server returned status: ${response.status}`);
      }
      const blob = await response.blob();
      const file = new File([blob], 'Addison_Wesley_The_Mythical_Man_Month_Pages.zip', { type: 'application/zip' });

      await pdfStore.saveFile(id, file);

      const newDoc: DocumentMetadata = {
        id,
        name: 'The Mythical Man-Month (Markdown ZIP)',
        url: sampleUrl,
        totalPages: 322,
        currentPageIndex: 0,
        activeBlockIndex: 0,
        activeWordIndex: 0,
        updatedAt: Date.now(),
        isZip: true,
      };

      setFileObjects(prev => ({ ...prev, [id]: file }));
      setDocuments(prev => [newDoc, ...prev]);
      handleSelectDocument(newDoc);
      console.log('🐝 [App.tsx] Sample ZIP loaded and saved to IndexedDB successfully!');
    } catch (err: any) {
      console.error('Failed to download or load sample ZIP document:', err);
      alert(`Oh honeycomb, we hit a snag loading the ZIP sample: ${err.message || err}`);
    } finally {
      setZipFetchLoading(false);
    }
  };

  const handlePairPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocId) return;

    try {
      console.log(`🐝 [App.tsx] Saving paired PDF file "${file.name}" for document ${activeDocId}`);
      await pdfStore.saveFile(`${activeDocId}-paired-pdf`, file);
      setPairedPdfFile(file);

      // Update documents metadata with pairedPdfName
      setDocuments(prev => prev.map(doc => {
        if (doc.id === activeDocId) {
          return {
            ...doc,
            pairedPdfName: file.name
          };
        }
        return doc;
      }));
      console.log('🐝 [App.tsx] Paired PDF successfully saved to IndexedDB!');
    } catch (err) {
      console.error('Failed to save paired PDF to IndexedDB:', err);
    }
  };

  // Get current PDF URL (resolve File object if uploaded file, otherwise URL)
  const getActivePdfUrl = (): string | File => {
    if (!activeDoc) return '';
    if (activeDoc.isSample) return activeDoc.url;
    
    // Check if we have the file object in memory
    const file = fileObjects[activeDoc.id];
    if (file) {
      return file;
    }
    
    return activeDoc.url; // Fallback to saved URL
  };

  // =========================================================================
  // Render Helper Components
  // =========================================================================

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'
    }`}>
      {/* Header */}
      <header className={`transition-colors duration-200 shadow-md px-6 py-4 flex items-center justify-between ${
        darkMode ? 'bg-slate-900 border-b border-slate-800 text-white' : 'bg-amber-500 text-white'
      }`}>
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-lg shadow-inner ${
            darkMode ? 'bg-slate-800 text-amber-400' : 'bg-white text-amber-500'
          }`}>
            <Sparkles className="h-6 w-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center">
              Bimodal Reader <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${
                darkMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-amber-600'
              }`}>MVP</span>
            </h1>
            <p className={`text-xs font-medium ${
              darkMode ? 'text-slate-400' : 'text-amber-100'
            }`}>Immersion Reading with Real-time TTS & Nostr Sync 🐝</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Nostr Sync Indicator */}
          <div 
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              syncStatus === 'connected' 
                ? 'bg-emerald-600 text-white' 
                : syncStatus === 'connecting'
                ? 'bg-amber-600 text-white animate-pulse'
                : syncStatus === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-slate-700 text-slate-300'
            }`}
            title={`Nostr Sync: ${syncStatus}`}
          >
            {syncStatus === 'connected' ? (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span>Synced</span>
              </>
            ) : syncStatus === 'connecting' ? (
              <>
                <Wifi className="h-3.5 w-3.5 animate-bounce" />
                <span>Connecting</span>
              </>
            ) : syncStatus === 'error' ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Sync Error</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Sync Off</span>
              </>
            )}
          </div>

          {/* Dark Mode Toggle Button */}
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-full transition-colors ${
              darkMode ? 'hover:bg-slate-800 text-amber-400' : 'hover:bg-amber-600 text-white'
            }`}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-colors ${
              darkMode ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-amber-600 text-white'
            }`}
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Settings Modal Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-xs">
          <div className={`${
            darkMode ? 'bg-slate-900 border border-slate-800 text-slate-100' : 'bg-white text-slate-800'
          } rounded-2xl shadow-2xl max-w-md w-full p-6 relative`}>
            <h3 className={`text-lg font-bold mb-4 flex items-center ${
              darkMode ? 'text-slate-100' : 'text-slate-800'
            }`}>
              <Settings className="h-5 w-5 mr-2 text-amber-500" />
              Bimodal Reader Settings
            </h3>

            {/* Tab Headers */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setActiveSettingsTab('sync')}
                className={`flex-1 pb-2 text-sm font-semibold text-center transition-colors border-b-2 ${
                  activeSettingsTab === 'sync'
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Progress Sync
              </button>
              <button
                type="button"
                onClick={() => setActiveSettingsTab('tts')}
                className={`flex-1 pb-2 text-sm font-semibold text-center transition-colors border-b-2 ${
                  activeSettingsTab === 'tts'
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Inworld AI TTS
              </button>
            </div>
            
            {activeSettingsTab === 'sync' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className={`font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Enable Nostr Sync</label>
                  <input 
                    type="checkbox" 
                    checked={nostrEnabled}
                    onChange={(e) => setNostrEnabled(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Relay URL</label>
                  <input 
                    type="text" 
                    value={relayUrl}
                    onChange={(e) => setRelayUrl(e.target.value)}
                    placeholder="wss://relay.damus.io"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.nostr.band', 'ws://localhost:3000'].map((suggestedRelay) => (
                      <button
                        key={suggestedRelay}
                        type="button"
                        onClick={() => setRelayUrl(suggestedRelay)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          relayUrl === suggestedRelay
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {suggestedRelay.replace('wss://', '').replace('ws://', '')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>User Pubkey (Hex)</label>
                  <input 
                    type="text" 
                    value={userPubkey}
                    onChange={(e) => setUserPubkey(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      darkMode ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 bg-slate-50'
                    }`}
                  />
                </div>

                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  darkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-100 text-amber-800'
                }`}>
                  <p className="font-semibold">🐝 How does this work?</p>
                  <p>We publish signed Nostr Kind 30078 events containing your reading coordinates `(page, block, word)` to the relay. Other devices subscribed to the same pubkey will instantly receive and reconcile progress!</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className={`font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Enable Inworld TTS</label>
                  <input 
                    type="checkbox" 
                    checked={inworldEnabled}
                    onChange={(e) => setInworldEnabled(e.target.checked)}
                    className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Basic Auth Signature or API Key</label>
                  <input 
                    type="password" 
                    value={inworldApiKey}
                    onChange={(e) => setInworldApiKey(e.target.value)}
                    placeholder="Basic YXBpLWtleS1zaWduYXR1cmU..."
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <p className={`text-[10px] mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Generate key at platform.inworld.ai and copy the "Basic (Base64)" authorization signature.
                  </p>
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Voice ID</label>
                  <input 
                    type="text" 
                    value={inworldVoiceId}
                    onChange={(e) => setInworldVoiceId(e.target.value)}
                    placeholder="Ashley"
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200'
                    }`}
                  />
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {['Ashley', 'Sarah', 'Dennis', 'Tyler', 'Dennis-2'].map((voice) => (
                      <button
                        key={voice}
                        type="button"
                        onClick={() => setInworldVoiceId(voice)}
                        className={`text-[10px] px-2.5 py-0.5 rounded border transition-colors ${
                          inworldVoiceId === voice
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                            : darkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {voice}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  darkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' : 'bg-amber-50 border-amber-100 text-amber-800'
                }`}>
                  <p className="font-semibold">🐝 Studio-Quality Neural TTS</p>
                  <p>Inworld's TTS-2 neural engine delivers sub-200ms streaming latency and realistic, human-like voice inflections with exact sub-word alignment markers for pristine text highlights.</p>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-semibold text-sm shadow transition-colors"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: Library View */}
        <aside className={`w-80 border-r flex flex-col transition-colors duration-200 ${
          darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
        }`}>
          <div className={`p-4 border-b flex items-center justify-between ${
            darkMode ? 'border-slate-800/80' : 'border-slate-100'
          }`}>
            <h2 className={`font-bold flex items-center ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>
              <BookOpen className="h-5 w-5 mr-2 text-amber-500" />
              Your Library
            </h2>
            <label className={`cursor-pointer p-1.5 rounded-lg transition-colors flex items-center text-xs font-semibold ${
              darkMode ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
            }`}>
              <Plus className="h-4 w-4 mr-1" />
              Add PDF/ZIP
              <input 
                type="file" 
                accept=".pdf,.zip" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {documents.length === 0 ? (
              <div className="text-center py-12 px-4 flex flex-col items-center justify-center space-y-2">
                <FileText className={`h-12 w-12 mb-2 ${darkMode ? 'text-slate-700' : 'text-slate-300'}`} />
                <p className={`text-sm font-medium ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>Your library is empty.</p>
                <button 
                  onClick={handleLoadSample}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors w-full max-w-[180px] ${
                    darkMode ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-amber-50 hover:bg-amber-100 text-amber-600'
                  }`}
                >
                  Load Sample PDF
                </button>
                <button 
                  onClick={handleLoadSampleZip}
                  disabled={zipFetchLoading}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors w-full max-w-[180px] flex items-center justify-center space-x-1 ${
                    darkMode ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                  }`}
                >
                  {zipFetchLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-amber-500"></div>
                      <span>Downloading...</span>
                    </>
                  ) : (
                    <span>Load Mythical Man-Month (ZIP)</span>
                  )}
                </button>
              </div>
            ) : (
              documents.map(doc => {
                const isActive = doc.id === activeDocId;
                const progressPercent = doc.totalPages > 0 
                  ? Math.round((doc.currentPageIndex / doc.totalPages) * 100) 
                  : 0;

                return (
                  <div 
                    key={doc.id}
                    onClick={() => handleSelectDocument(doc)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col space-y-2 ${
                      isActive 
                        ? darkMode 
                          ? 'border-amber-500 bg-amber-500/5 shadow-sm'
                          : 'border-amber-500 bg-amber-50/40 shadow-sm' 
                        : darkMode
                          ? 'border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
                          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between w-full min-w-0">
                      <div className="flex items-start space-x-2.5 min-w-0 flex-1 mr-2">
                        <FileText className={`h-5 w-5 mt-0.5 shrink-0 ${isActive ? 'text-amber-500' : 'text-slate-400'}`} />
                        <span className={`text-sm font-semibold leading-tight line-clamp-2 break-all ${
                          isActive 
                            ? 'text-amber-500' 
                            : darkMode 
                            ? 'text-slate-300' 
                            : 'text-slate-700'
                        }`}>
                          {doc.name}
                        </span>
                      </div>
                      {!doc.isSample && (
                        <button 
                          onClick={(e) => handleDeleteDocument(doc.id, e)}
                          className={`p-1 rounded shrink-0 transition-colors ${
                            darkMode ? 'text-slate-500 hover:text-rose-400 hover:bg-slate-800' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100'
                          }`}
                          title="Delete document"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs font-medium pt-1">
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>Page {doc.currentPageIndex + 1} of {doc.totalPages || '?'}</span>
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>{progressPercent}% read</span>
                    </div>

                    <div className={`w-full h-1.5 rounded-full overflow-hidden ${darkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <div 
                        className="bg-amber-500 h-full transition-all duration-300" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className={`p-4 border-t text-xs transition-colors duration-200 ${
            darkMode ? 'border-slate-800 bg-slate-900/50 text-slate-400' : 'border-slate-100 bg-slate-50 text-slate-500'
          }`}>
            <p className={`font-semibold mb-1 ${darkMode ? 'text-amber-400' : 'text-slate-600'}`}>🐝 Bumble's Tip:</p>
            <p>Click any word inside the PDF to instantly jump the speech engine to that exact word!</p>
          </div>
        </aside>

        {/* Reader View */}
        <main className={`flex-1 flex flex-col overflow-hidden relative transition-colors duration-200 ${
          darkMode ? 'bg-slate-950' : 'bg-slate-100'
        }`}>
          {activeDoc ? (
            <>
              {/* Playback & Navigation Controls */}
              <section className={`border-b px-6 py-3 flex flex-wrap items-center justify-between gap-4 shadow-sm z-10 transition-colors duration-200 ${
                darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
              }`}>
                {/* Left: Navigation */}
                <div className="flex items-center space-x-3">
                  <button 
                    onClick={() => handlePageChange(pageIndex - 1)}
                    disabled={pageIndex === 0}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent' 
                        : 'bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent'
                    }`}
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <span className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
                    darkMode ? 'text-slate-300 bg-slate-800 border border-slate-700/60' : 'text-slate-700 bg-slate-100'
                  }`}>
                    Page {pageIndex + 1} of {totalPages}
                  </span>

                  <button 
                    onClick={() => handlePageChange(pageIndex + 1)}
                    disabled={pageIndex + 1 >= totalPages}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      darkMode 
                        ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent' 
                        : 'bg-white border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent'
                    }`}
                    title="Next Page"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-2 dark:bg-slate-800" />

                  {/* Reader Mode Toggle */}
                  {activeDoc?.isZip ? (
                    <div className={`flex p-0.5 rounded-lg border transition-colors duration-200 ${
                      darkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-100 border-slate-200/60'
                    }`}>
                      <button 
                        onClick={() => {
                          setReaderMode('document');
                          localStorage.setItem('bimodal-reader-mode', 'document');
                        }}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          readerMode === 'document'
                            ? darkMode 
                              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                              : 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="Read as a beautifully styled clean text document"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Markdown</span>
                      </button>
                      <button 
                        onClick={() => {
                          setReaderMode('side-by-side');
                          localStorage.setItem('bimodal-reader-mode', 'side-by-side');
                        }}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          readerMode === 'side-by-side'
                            ? darkMode
                              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                              : 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="View original PDF page side-by-side"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Side-by-Side</span>
                      </button>
                    </div>
                  ) : (
                    <div className={`flex p-0.5 rounded-lg border transition-colors duration-200 ${
                      darkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-100 border-slate-200/60'
                    }`}>
                      <button 
                        onClick={() => {
                          setReaderMode('document');
                          localStorage.setItem('bimodal-reader-mode', 'document');
                        }}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          readerMode === 'document'
                            ? darkMode 
                              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                              : 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="Read as a beautifully styled clean text document"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Reflow Text</span>
                      </button>
                      <button 
                        onClick={() => {
                          setReaderMode('pdf');
                          localStorage.setItem('bimodal-reader-mode', 'pdf');
                        }}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                          readerMode === 'pdf'
                            ? darkMode
                              ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/50'
                              : 'bg-white text-slate-800 shadow-sm border border-slate-200/40'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                        title="View original PDF page fallback"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Original PDF</span>
                      </button>
                    </div>
                  )}

                  <div className="h-6 w-px bg-slate-200 mx-2 dark:bg-slate-800" />

                  {/* Zoom / Font Size Controls */}
                  <button 
                    onClick={() => setScale(prev => Math.max(0.6, prev - 0.1))}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                    title={readerMode === 'document' ? "Decrease Font Size" : "Zoom Out"}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => setScale(prev => Math.min(2.5, prev + 0.1))}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      darkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                    title={readerMode === 'document' ? "Increase Font Size" : "Zoom In"}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-2 dark:bg-slate-800" />

                  {/* Text Side Panel Toggle */}
                  <button 
                    onClick={() => {
                      setShowTextPanel(prev => {
                        const next = !prev;
                        localStorage.setItem('bimodal-show-text-panel', next.toString());
                        return next;
                      });
                    }}
                    className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-xs font-semibold ${
                      showTextPanel 
                        ? darkMode
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/40 shadow-sm'
                          : 'bg-amber-50 text-amber-700 border-amber-300 shadow-sm' 
                        : darkMode
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                          : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                    title={showTextPanel ? "Hide Extracted Text Panel" : "Show Extracted Text Panel"}
                  >
                    <AlignLeft className="h-4 w-4" />
                    <span>Text Panel</span>
                  </button>
                </div>

                {/* Center: Playback Controls */}
                <div className="flex items-center space-x-2">
                  {isPlaying ? (
                    isPaused ? (
                      <button 
                        onClick={resume}
                        className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20 transition-all"
                      >
                        <Play className="h-4 w-4 fill-current" />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button 
                        onClick={pause}
                        className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20 transition-all"
                      >
                        <Pause className="h-4 w-4 fill-current" />
                        <span>Pause</span>
                      </button>
                    )
                  ) : (
                    <button 
                      onClick={() => play(
                        activeBlockIndex !== null && activeBlockIndex >= 0 ? activeBlockIndex : 0,
                        activeWordIndex !== null && activeWordIndex >= 0 ? activeWordIndex : 0
                      )}
                      className="flex items-center space-x-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold shadow-md shadow-amber-500/20 transition-all"
                    >
                      <Play className="h-4 w-4 fill-current" />
                      <span>Listen Page</span>
                    </button>
                  )}

                  <button 
                    onClick={handleStop}
                    disabled={!isPlaying}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode 
                        ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 disabled:hover:bg-transparent' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent'
                    }`}
                    title="Stop Playback"
                  >
                    <Square className="h-5 w-5 fill-current" />
                  </button>
                </div>

                {/* Right: Voice & Speed Settings */}
                <div className="flex items-center space-x-4">
                  {/* Voice Select */}
                  <div className="flex items-center space-x-1.5">
                    <Volume2 className="h-4 w-4 text-slate-400" />
                    <select 
                      value={selectedVoice?.name || ''}
                      onChange={(e) => {
                        const v = voices.find(voice => voice.name === e.target.value);
                        if (v) setSelectedVoice(v);
                      }}
                      className={`text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-[150px] border rounded-lg px-2 py-1.5 ${
                        darkMode 
                          ? 'bg-slate-800 border-slate-700 text-slate-200' 
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {voices.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Speed Slider */}
                  <div className="flex items-center space-x-2">
                    <Sliders className="h-4 w-4 text-slate-400" />
                    <span className={`text-xs font-bold w-8 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{rate.toFixed(1)}x</span>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="2.5" 
                      step="0.1"
                      value={rate}
                      onChange={(e) => setRate(parseFloat(e.target.value))}
                      className={`w-16 accent-amber-500 h-1 rounded-lg appearance-none cursor-pointer ${
                        darkMode ? 'bg-slate-800' : 'bg-slate-200'
                      }`}
                      title="Adjust Playback Speed"
                    />
                  </div>

                  {/* Volume Slider */}
                  <div className="flex items-center space-x-1.5">
                    <Volume2 className="h-4 w-4 text-slate-400" />
                    <span className={`text-xs font-bold w-10 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{Math.round(volume * 100)}%</span>
                    <input 
                      type="range" 
                      min="0.0" 
                      max="1.0" 
                      step="0.05"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className={`w-16 accent-amber-500 h-1 rounded-lg appearance-none cursor-pointer ${
                        darkMode ? 'bg-slate-800' : 'bg-slate-200'
                      }`}
                      title="Adjust Volume"
                    />
                  </div>
                </div>
              </section>

              {/* PDF & Extracted Text Side-by-Side Area */}
              <div className="flex-1 flex overflow-hidden">
                {/* Main Content Area (Either PDF View or Clean Reflow Document Page) */}
                <div className="flex-1 overflow-auto p-6 flex flex-col items-center">
                  {readerMode === 'pdf' ? (
                    <div className="flex-1 flex items-center justify-center">
                      <BimodalPDFViewer 
                        pdfUrl={getActivePdfUrl()}
                        pageIndex={pageIndex}
                        activeBlockIndex={activeBlockIndex}
                        activeWordIndex={activeWordIndex}
                        scale={scale}
                        onTextExtracted={handleTextExtracted}
                        onWordTap={handleWordTap}
                        onPageLoadSuccess={handlePageLoadSuccess}
                        isPlaying={isPlaying}
                        isPaused={isPaused}
                      />
                    </div>
                  ) : readerMode === 'side-by-side' ? (
                    /* Elegant Dual-Pane Side-by-Side Mode with Perfect Vertical Alignment */
                    <div className="flex-1 w-full flex flex-col xl:flex-row gap-6 items-stretch justify-stretch overflow-hidden h-[calc(100vh-230px)]">
                      {/* Left Pane: Beautiful Markdown / Reflow Text */}
                      <div className="flex-1 h-full min-h-0 flex flex-col">
                        <div className={`w-full shadow-xl rounded-2xl p-10 flex flex-col transition-all duration-300 border flex-1 overflow-y-auto ${
                          darkMode ? 'bg-slate-900 border-slate-800/80 text-slate-100' : 'bg-white border-slate-200/60 text-slate-800'
                        }`}>
                          <div className={`border-b pb-4 mb-6 flex items-center justify-between text-xs font-bold tracking-wider shrink-0 ${
                            darkMode ? 'border-slate-800/60 text-slate-500' : 'border-slate-100 text-slate-400'
                          }`}>
                            <span className="uppercase truncate max-w-[200px]">{activeDoc.name}</span>
                            <span>PAGE {pageIndex + 1} OF {totalPages}</span>
                          </div>

                          <div className="flex-1 space-y-6">
                            {zipLoading || (activeDoc?.isZip && markdownBlocks.length === 0) ? (
                              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400">
                                <Sparkles className="h-10 w-10 text-amber-400 mb-2 animate-spin" />
                                <p className="text-sm font-semibold">Extracting high-fidelity markdown... 🐝</p>
                              </div>
                            ) : (
                              markdownBlocks.map((block, blockIdx) => {
                                const hasActiveWord = activeBlockIndex === blockIdx;
                                const Tag = block.type === 'li' ? 'li' : block.type;
                                
                                let customClasses = "";
                                if (block.type === 'h1') {
                                  customClasses = "text-2xl font-extrabold mb-4 mt-2 leading-tight tracking-tight";
                                } else if (block.type === 'h2') {
                                  customClasses = "text-xl font-bold mb-3 mt-2 leading-snug tracking-tight";
                                } else if (block.type === 'h3') {
                                  customClasses = "text-lg font-semibold mb-2 mt-1 leading-snug";
                                } else if (block.type === 'blockquote') {
                                  customClasses = `border-l-4 pl-4 italic my-3 ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`;
                                } else if (block.type === 'li') {
                                  customClasses = "list-disc ml-5 mb-1.5";
                                } else {
                                  customClasses = "mb-3";
                                }

                                return (
                                  <Tag 
                                    key={`side-doc-block-${blockIdx}`}
                                    className={`leading-relaxed text-justify transition-all duration-150 rounded-xl p-1.5 ${
                                      hasActiveWord 
                                        ? darkMode 
                                          ? 'bg-amber-500/5 border-l-2 border-amber-500 pl-2.5'
                                          : 'bg-amber-50/10 border-l-2 border-amber-400 pl-2.5' 
                                        : ''
                                    } ${
                                      darkMode ? 'text-slate-200' : 'text-slate-800'
                                    } ${customClasses}`}
                                    style={{ fontSize: `${scale * (block.type.startsWith('h') ? 1.15 : 1) * 15}px` }}
                                  >
                                    <span className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                                      {(() => {
                                        const blockText = block.text;
                                        const tokens = block.tokens;
                                        let lastIndex = 0;
                                        const elements: React.ReactNode[] = [];

                                        tokens.forEach((token, tokenIdx) => {
                                          if (token.startIndex > lastIndex) {
                                            elements.push(
                                              <span 
                                                key={`side-doc-inter-${blockIdx}-${tokenIdx}`}
                                                className="text-slate-400 font-serif select-none animate-fade-in"
                                              >
                                                {blockText.slice(lastIndex, token.startIndex)}
                                              </span>
                                            );
                                          }

                                          const isActive = activeBlockIndex === blockIdx && activeWordIndex === token.elementIndex;
                                          let highlightStyles = darkMode 
                                            ? "text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded px-0.5 transition-all duration-100"
                                            : "text-slate-800 hover:text-slate-900 hover:bg-amber-100 rounded px-0.5 transition-all duration-100";
                                          if (isActive) {
                                            if (!isPlaying) {
                                              highlightStyles = "bg-slate-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                            } else if (isPaused) {
                                              highlightStyles = "bg-sky-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                            } else {
                                              highlightStyles = "bg-amber-500 text-slate-950 rounded px-1.5 font-bold shadow-lg shadow-amber-500/30 scale-105 duration-100";
                                            }
                                          }

                                          elements.push(
                                            <span
                                              key={`side-doc-word-${blockIdx}-${tokenIdx}`}
                                              onClick={() => handleWordTap(blockIdx, token.elementIndex)}
                                              className={`cursor-pointer select-text ${highlightStyles}`}
                                              title="Click to play from here"
                                            >
                                              {token.word}
                                            </span>
                                          );
                                          lastIndex = token.endIndex;
                                        });

                                        if (lastIndex < blockText.length) {
                                          elements.push(
                                            <span 
                                              key={`side-doc-inter-end-${blockIdx}`}
                                              className="text-slate-400 font-serif select-none"
                                            >
                                              {blockText.slice(lastIndex)}
                                            </span>
                                          );
                                        }

                                        return elements;
                                      })()}
                                    </span>
                                  </Tag>
                                );
                              })
                            )}
                          </div>

                          <div className={`border-t pt-4 mt-8 flex items-center justify-center text-[10px] font-bold tracking-wider shrink-0 ${
                            darkMode ? 'border-slate-800/60 text-slate-700' : 'border-slate-100 text-slate-300'
                          }`}>
                            <span>BIMODAL READ CANVAS</span>
                          </div>
                        </div>
                      </div>

                      {/* Right Pane: Original PDF View or Pair Upload Trigger */}
                      <div className="flex-1 h-full min-h-0 flex flex-col">
                        {pairedPdfFile ? (
                          <BimodalPDFViewer 
                            pdfUrl={pairedPdfFile}
                            pageIndex={pageIndex}
                            activeBlockIndex={null}
                            activeWordIndex={null}
                            scale={scale * 0.85}
                            onTextExtracted={() => {}}
                            onWordTap={() => {}}
                            onPageLoadSuccess={() => {}}
                            isPlaying={isPlaying}
                            isPaused={isPaused}
                            className="w-full h-full border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-xl bg-white dark:bg-slate-900"
                            style={{ maxHeight: '100%' }}
                          />
                        ) : (
                          <div className={`w-full shadow-xl rounded-2xl p-10 flex flex-col items-center justify-center text-center border flex-1 h-full ${
                            darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                          }`}>
                            <div className="p-4 rounded-full bg-amber-500/10 mb-4 text-amber-500">
                              <Upload className="h-10 w-10 animate-bounce" />
                            </div>
                            <h4 className="font-bold text-lg mb-2">Pair Original PDF 🐝✨</h4>
                            <p className={`text-xs mb-6 max-w-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              Link the original Mythical Man-Month (or any PDF file) with your Markdown book to view them side-by-side with synchronized page turning!
                            </p>
                            <label className="cursor-pointer bg-amber-500 hover:bg-amber-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-md shadow-amber-500/20 text-xs transition-colors">
                              Upload Original PDF
                              <input 
                                type="file" 
                                accept=".pdf" 
                                onChange={handlePairPdfUpload} 
                                className="hidden" 
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Beautiful Reflow Document Canvas */
                    <div className="flex-1 w-full max-w-3xl py-4 flex flex-col items-center">
                      {/* Hidden PDF.js viewer so it still extracts the text background-wise (only for PDFs) */}
                      {!activeDoc?.isZip && (
                        <div className="hidden">
                          <BimodalPDFViewer 
                            pdfUrl={getActivePdfUrl()}
                            pageIndex={pageIndex}
                            activeBlockIndex={activeBlockIndex}
                            activeWordIndex={activeWordIndex}
                            scale={1.2} // fixed scale for background text extraction
                            onTextExtracted={handleTextExtracted}
                            onWordTap={handleWordTap}
                            onPageLoadSuccess={handlePageLoadSuccess}
                            isPlaying={isPlaying}
                            isPaused={isPaused}
                          />
                        </div>
                      )}

                      {/* Paper Document Canvas */}
                      <div className={`w-full shadow-xl rounded-2xl p-12 min-h-[750px] flex flex-col transition-all duration-300 border ${
                        darkMode ? 'bg-slate-900 border-slate-800/80 text-slate-100' : 'bg-white border-slate-200/60 text-slate-800'
                      }`}>
                        {/* Paper header */}
                        <div className={`border-b pb-4 mb-6 flex items-center justify-between text-xs font-bold tracking-wider ${
                          darkMode ? 'border-slate-800/60 text-slate-500' : 'border-slate-100 text-slate-400'
                        }`}>
                          <span className="uppercase truncate max-w-[350px]">{activeDoc.name}</span>
                          <span>PAGE {pageIndex + 1} OF {totalPages}</span>
                        </div>

                        {/* Page content */}
                        <div className="flex-1 space-y-6">
                          {zipLoading || (activeDoc?.isZip && markdownBlocks.length === 0) ? (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                              <Sparkles className="h-10 w-10 text-amber-400 mb-2 animate-spin" />
                              <p className="text-sm font-semibold">Extracting high-fidelity markdown... 🐝</p>
                              <p className="text-xs mt-1 text-slate-400">Our hive is preparing this chapter's pages!</p>
                            </div>
                          ) : activeDoc?.isZip ? (
                            markdownBlocks.map((block, blockIdx) => {
                              const hasActiveWord = activeBlockIndex === blockIdx;
                              const Tag = block.type === 'li' ? 'li' : block.type;
                              
                              let customClasses = "";
                              if (block.type === 'h1') {
                                customClasses = "text-3xl font-extrabold mb-5 mt-3 leading-tight tracking-tight";
                              } else if (block.type === 'h2') {
                                customClasses = "text-2xl font-bold mb-4 mt-3 leading-snug tracking-tight";
                              } else if (block.type === 'h3') {
                                customClasses = "text-xl font-semibold mb-3 mt-2 leading-snug";
                              } else if (block.type === 'h4') {
                                customClasses = "text-lg font-semibold mb-3 mt-2 leading-snug";
                              } else if (block.type === 'h5' || block.type === 'h6') {
                                customClasses = "text-base font-semibold mb-2 mt-1 leading-snug";
                              } else if (block.type === 'blockquote') {
                                customClasses = `border-l-4 pl-4 italic my-4 ${darkMode ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`;
                              } else if (block.type === 'li') {
                                customClasses = "list-disc ml-5 mb-2";
                              } else {
                                customClasses = "mb-4";
                              }

                              return (
                                <Tag 
                                  key={`doc-block-${blockIdx}`}
                                  className={`leading-relaxed text-justify transition-all duration-150 rounded-xl p-2 ${
                                    hasActiveWord 
                                      ? darkMode 
                                        ? 'bg-amber-500/5 border-l-2 border-amber-500 pl-3'
                                        : 'bg-amber-50/10 border-l-2 border-amber-400 pl-3' 
                                      : ''
                                  } ${
                                    darkMode ? 'text-slate-200' : 'text-slate-800'
                                  } ${customClasses}`}
                                  style={{ fontSize: `${scale * (block.type.startsWith('h') ? 1.2 : 1) * 16}px` }}
                                >
                                  <span className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                                    {(() => {
                                      const blockText = block.text;
                                      const tokens = block.tokens;
                                      let lastIndex = 0;
                                      const elements: React.ReactNode[] = [];

                                      tokens.forEach((token, tokenIdx) => {
                                        if (token.startIndex > lastIndex) {
                                          elements.push(
                                            <span 
                                              key={`doc-inter-${blockIdx}-${tokenIdx}`}
                                              className="text-slate-400 font-serif select-none animate-fade-in"
                                            >
                                              {blockText.slice(lastIndex, token.startIndex)}
                                            </span>
                                          );
                                        }

                                        const isActive = activeBlockIndex === blockIdx && activeWordIndex === token.elementIndex;
                                        let highlightStyles = darkMode 
                                          ? "text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded px-0.5 transition-all duration-100"
                                          : "text-slate-800 hover:text-slate-900 hover:bg-amber-100 rounded px-0.5 transition-all duration-100";
                                        if (isActive) {
                                          if (!isPlaying) {
                                            highlightStyles = "bg-slate-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                          } else if (isPaused) {
                                            highlightStyles = "bg-sky-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                          } else {
                                            highlightStyles = "bg-amber-500 text-slate-950 rounded px-1.5 font-bold shadow-lg shadow-amber-500/30 scale-105 duration-100";
                                          }
                                        }

                                        elements.push(
                                          <span
                                            key={`doc-word-${blockIdx}-${tokenIdx}`}
                                            onClick={() => handleWordTap(blockIdx, token.elementIndex)}
                                            className={`cursor-pointer select-text ${highlightStyles}`}
                                            title="Click to play from here"
                                          >
                                            {token.word}
                                          </span>
                                        );
                                        lastIndex = token.endIndex;
                                      });

                                      if (lastIndex < blockText.length) {
                                        elements.push(
                                          <span 
                                            key={`doc-inter-end-${blockIdx}`}
                                            className="text-slate-400 font-serif select-none"
                                          >
                                            {blockText.slice(lastIndex)}
                                          </span>
                                        );
                                      }

                                      return elements;
                                    })()}
                                  </span>
                                </Tag>
                              );
                            })
                          ) : blocks.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-slate-400">
                              <Sparkles className="h-10 w-10 text-amber-400 mb-2 animate-spin" />
                              <p className="text-sm font-semibold">Extracting high-fidelity text...</p>
                              <p className="text-xs mt-1 text-slate-400">Our hive is working on reading this page!</p>
                            </div>
                          ) : (
                            blocks.map((blockText, blockIdx) => {
                              const hasActiveWord = activeBlockIndex === blockIdx;
                              return (
                                <p 
                                  key={`doc-block-${blockIdx}`}
                                  className={`leading-relaxed text-justify transition-all duration-150 rounded-xl p-2 ${
                                    hasActiveWord 
                                      ? darkMode 
                                        ? 'bg-amber-500/5 border-l-2 border-amber-500 pl-3'
                                        : 'bg-amber-50/10 border-l-2 border-amber-400 pl-3' 
                                      : ''
                                  } ${
                                    darkMode ? 'text-slate-200' : 'text-slate-800'
                                  }`}
                                  style={{ fontSize: `${scale * 16}px` }}
                                >
                                  <span className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                                    {(() => {
                                      const tokens = tokenizeBlock(blockText);
                                      let lastIndex = 0;
                                      const elements: React.ReactNode[] = [];

                                      tokens.forEach((token, tokenIdx) => {
                                        // Interstitial text/punctuation
                                        if (token.startIndex > lastIndex) {
                                          elements.push(
                                            <span 
                                              key={`doc-inter-${blockIdx}-${tokenIdx}`}
                                              className="text-slate-400 font-serif select-none animate-fade-in"
                                            >
                                              {blockText.slice(lastIndex, token.startIndex)}
                                            </span>
                                          );
                                        }

                                        // Highlight class/styles
                                        const isActive = activeBlockIndex === blockIdx && activeWordIndex === token.elementIndex;
                                        let highlightStyles = darkMode 
                                          ? "text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded px-0.5 transition-all duration-100"
                                          : "text-slate-800 hover:text-slate-900 hover:bg-amber-100 rounded px-0.5 transition-all duration-100";
                                        if (isActive) {
                                          if (!isPlaying) {
                                            highlightStyles = "bg-slate-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                          } else if (isPaused) {
                                            highlightStyles = "bg-sky-500 text-white rounded px-1.5 font-bold shadow-md scale-105 duration-100 animate-pulse";
                                          } else {
                                            highlightStyles = "bg-amber-500 text-slate-950 rounded px-1.5 font-bold shadow-lg shadow-amber-500/30 scale-105 duration-100";
                                          }
                                        }

                                        elements.push(
                                          <span
                                            key={`doc-word-${blockIdx}-${tokenIdx}`}
                                            onClick={() => handleWordTap(blockIdx, token.elementIndex)}
                                            className={`cursor-pointer select-text ${highlightStyles}`}
                                            title="Click to play from here"
                                          >
                                            {token.word}
                                          </span>
                                        );
                                        lastIndex = token.endIndex;
                                      });

                                      if (lastIndex < blockText.length) {
                                        elements.push(
                                          <span 
                                            key={`doc-inter-end-${blockIdx}`}
                                            className="text-slate-400 font-serif select-none"
                                          >
                                            {blockText.slice(lastIndex)}
                                          </span>
                                        );
                                      }

                                      return elements;
                                    })()}
                                  </span>
                                </p>
                              );
                            })
                          )}
                        </div>

                        {/* Paper footer */}
                        <div className={`border-t pt-4 mt-8 flex items-center justify-center text-[10px] font-bold tracking-wider ${
                          darkMode ? 'border-slate-800/60 text-slate-700' : 'border-slate-100 text-slate-300'
                        }`}>
                          <span>BIMODAL READ CANVAS</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Text Side Panel */}
                {showTextPanel && (
                  <aside className={`w-96 border-l flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 transition-colors ${
                    darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}>
                    <div className={`p-4 border-b flex items-center justify-between ${
                      darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
                    }`}>
                      <h3 className={`font-bold text-sm flex items-center ${darkMode ? 'text-slate-100' : 'text-slate-700'}`}>
                        <AlignLeft className="h-4 w-4 mr-2 text-amber-500" />
                        Extracted Page Text
                      </h3>
                      <span className="text-xs bg-amber-100 dark:bg-amber-500/20 dark:text-amber-400 text-amber-800 font-bold px-2 py-0.5 rounded-full border dark:border-amber-500/30">
                        Page {pageIndex + 1}
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {blocks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                          <FileText className="h-8 w-8 mb-2 opacity-50 text-amber-500 animate-pulse" />
                          <p className="text-xs font-semibold">No text extracted on this page yet.</p>
                          <p className="text-[10px] mt-1 text-slate-400 max-w-[200px]">Make sure your PDF contains selectable text layers!</p>
                        </div>
                      ) : (
                        blocks.map((blockText, blockIdx) => {
                          const hasActiveWord = activeBlockIndex === blockIdx;
                          return (
                            <div 
                              key={`text-block-${blockIdx}`}
                              className={`p-3.5 rounded-xl border text-sm leading-relaxed transition-all duration-150 ${
                                hasActiveWord 
                                  ? darkMode 
                                    ? 'border-amber-500/30 bg-amber-500/5 shadow-sm'
                                    : 'border-amber-200 bg-amber-50/20 shadow-sm' 
                                  : darkMode 
                                    ? 'border-slate-800/80 hover:border-slate-700 text-slate-300'
                                    : 'border-slate-100 hover:border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="flex flex-wrap gap-x-1.5 gap-y-1.5">
                                {(() => {
                                  const tokens = tokenizeBlock(blockText);
                                  let lastIndex = 0;
                                  const elements: React.ReactNode[] = [];

                                  tokens.forEach((token, tokenIdx) => {
                                    // Interstitial text/punctuation
                                    if (token.startIndex > lastIndex) {
                                      elements.push(
                                        <span 
                                          key={`inter-${blockIdx}-${tokenIdx}`}
                                          className="text-slate-400 font-mono select-none"
                                        >
                                          {blockText.slice(lastIndex, token.startIndex)}
                                        </span>
                                      );
                                    }

                                    // Highlight class/styles
                                    const isActive = activeBlockIndex === blockIdx && activeWordIndex === token.elementIndex;
                                    let highlightStyles = darkMode 
                                      ? "text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded px-0.5 transition-all duration-100"
                                      : "text-slate-700 hover:text-slate-900 hover:bg-amber-100/75 rounded px-0.5 transition-all duration-100";
                                    if (isActive) {
                                      if (!isPlaying) {
                                        highlightStyles = "bg-slate-500 text-white rounded px-1 font-semibold shadow-sm scale-105 duration-100 animate-pulse";
                                      } else if (isPaused) {
                                        highlightStyles = "bg-sky-500 text-white rounded px-1 font-semibold shadow-sm scale-105 duration-100 animate-pulse";
                                      } else {
                                        highlightStyles = "bg-amber-500 text-slate-950 rounded px-1 font-semibold shadow-md shadow-amber-500/25 scale-105 duration-100";
                                      }
                                    }

                                    elements.push(
                                      <span
                                        key={`word-${blockIdx}-${tokenIdx}`}
                                        onClick={() => handleWordTap(blockIdx, token.elementIndex)}
                                        className={`cursor-pointer select-text ${highlightStyles}`}
                                        title="Click to seek speech to this word"
                                      >
                                        {token.word}
                                      </span>
                                    );
                                    lastIndex = token.endIndex;
                                  });

                                  if (lastIndex < blockText.length) {
                                    elements.push(
                                      <span 
                                        key={`inter-end-${blockIdx}`}
                                        className="text-slate-400 font-mono select-none"
                                      >
                                        {blockText.slice(lastIndex)}
                                      </span>
                                    );
                                  }

                                  return elements;
                                })()}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </aside>
                )}
              </div>

              {/* Bottom Info Bar */}
              <footer className={`border-t px-6 py-2.5 flex items-center justify-between text-xs transition-colors duration-200 ${
                darkMode ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-500'
              }`}>
                <div className="truncate pr-4">
                  <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>Reading:</span> {activeDoc.name}
                </div>
                {lastSynced && (
                  <div className="shrink-0 font-medium">
                    Last synced: <span className={`font-mono px-1.5 py-0.5 rounded ${
                      darkMode ? 'bg-slate-950 text-slate-400 border border-slate-800/80' : 'bg-slate-100 text-slate-600'
                    }`}>{lastSynced}</span>
                  </div>
                )}
              </footer>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className={`p-6 rounded-2xl shadow-xl border max-w-md transition-colors ${
                darkMode ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-800'
              }`}>
                <Sparkles className="h-12 w-12 mx-auto text-amber-500 mb-4 animate-bounce" />
                <h3 className="text-xl font-bold mb-2">Welcome to your Bimodal Reader! 🐝</h3>
                <p className={`text-sm mb-6 leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Experience high-fidelity immersion reading. Upload your own PDF or load our pre-configured sample document to get started!
                </p>
                
                <div className="flex flex-col space-y-3">
                  <button 
                    onClick={handleLoadSample}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md shadow-amber-500/10 transition-colors"
                  >
                    Load Sample PDF Document
                  </button>

                  <button 
                    onClick={handleLoadSampleZip}
                    disabled={zipFetchLoading}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-md shadow-amber-500/10 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {zipFetchLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Downloading ZIP...</span>
                      </>
                    ) : (
                      <span>Load Mythical Man-Month (ZIP)</span>
                    )}
                  </button>
                  
                  <label className={`w-full py-2.5 font-bold rounded-xl transition-colors cursor-pointer block text-center ${
                    darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}>
                    Upload PDF or ZIP Book
                    <input 
                      type="file" 
                      accept=".pdf,.zip" 
                      onChange={handleFileUpload} 
                      className="hidden" 
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
