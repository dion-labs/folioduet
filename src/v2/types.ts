export type DocumentKind = 'pdf' | 'markdown-zip';

export type ReaderView = 'reading' | 'original' | 'parallel';

export type PdfExtractor = 'pageecho' | 'anydoc';

export type TtsBufferAhead = 1 | 3 | 5;

export type PdfExtractionStatus =
  | { state: 'extracting'; requested: PdfExtractor }
  | { state: 'ready'; requested: PdfExtractor; used: PdfExtractor }
  | { state: 'fallback'; requested: 'anydoc'; used: 'pageecho' }
  | { state: 'error'; requested: PdfExtractor };

export interface LibraryDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  sourceName: string;
  totalPages: number;
  currentPageIndex: number;
  activeBlockIndex: number;
  activeWordIndex: number;
  /** Global block index in the book stream — preferred for refresh / cross-device resume. */
  activeStreamIndex?: number;
  updatedAt: number;
  addedAt: number;
  pairedPdfName?: string;
  pairedPdfPages?: number;
  isSample?: boolean;
  url?: string;
  /**
   * When set, markdown/audio content is loaded from the shared catalog
   * (`pageecho/catalog/samples/{id}`) instead of per-user pages.
   */
  catalogSampleId?: string;
  /** True when processed markdown pages exist in cloud sync (Firebase). */
  hasProcessedContent?: boolean;
  processedFormat?: 'markdown-pages' | null;
}

export interface PageContent {
  pageIndex: number;
  blocks: string[];
}

export type DeviceSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export type TtsServerStatus =
  | 'checking'
  | 'ready'
  | 'missing-credential'
  | 'offline';

export interface ReaderPreferences {
  appearance: 'light' | 'dark';
  fontScale: number;
  playbackRate: number;
  volume: number;
  /** Number of upcoming stream segments neural TTS may prepare. */
  ttsBufferAhead: TtsBufferAhead;
  /** Local PDF-to-Markdown engine. AnyDoc remains opt-in while it is evaluated. */
  pdfExtractor: PdfExtractor;
  inworldEnabled: boolean;
  inworldVoiceId: string;
  /** @deprecated Kept empty; credentials live on the PageEcho server. */
  inworldApiKey: string;
  fishAudioEnabled: boolean;
  fishAudioVoiceId: string;
  /** @deprecated Kept empty; credentials live on the PageEcho server. */
  fishAudioApiKey: string;
}
