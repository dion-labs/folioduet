import type { NostrEvent } from '../utils/BimodalSyncEngine';

declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: NostrEvent): Promise<NostrEvent>;
    };
  }
}

export {};

