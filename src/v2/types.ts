export type DocumentKind = 'pdf' | 'markdown-zip';

export type ReaderView = 'reading' | 'original' | 'parallel';

export interface LibraryDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  sourceName: string;
  totalPages: number;
  currentPageIndex: number;
  activeBlockIndex: number;
  activeWordIndex: number;
  updatedAt: number;
  addedAt: number;
  pairedPdfName?: string;
  pairedPdfPages?: number;
  isSample?: boolean;
  url?: string;
}

export interface PageContent {
  pageIndex: number;
  blocks: string[];
}

export type SyncStatus =
  | 'disabled'
  | 'needs-signer'
  | 'connecting'
  | 'connected'
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
  inworldEnabled: boolean;
  inworldVoiceId: string;
  relayUrl: string;
  syncEnabled: boolean;
}
