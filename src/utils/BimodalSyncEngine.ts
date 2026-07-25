/**
 * BimodalSyncEngine.ts
 * 
 * A robust, production-ready TypeScript implementation of the Bimodal Reader
 * synchronization engine (Milestone 5). Handles local progress caching,
 * throttled Nostr Kind 30078 WebSocket synchronization, and progression-aware
 * merge reconciliation.
 */

export interface ProgressState {
  document_id: string;
  page_index: number;
  block_index: number;
  word_index: number;
  updated_at: number; // Unix timestamp in seconds
}

export interface LocalStore {
  get(documentId: string): Promise<ProgressState | null>;
  set(documentId: string, state: ProgressState): Promise<void>;
}

export interface NostrEvent {
  id?: string;
  pubkey?: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

export interface SyncEngineConfig {
  relayUrl: string;
  userPubkey: string;
  signEvent: (event: NostrEvent) => Promise<NostrEvent>;
  localStore?: LocalStore;
  onRemoteProgressApplied: (state: ProgressState) => void;
  throttleMs?: number; // default: 3000
  reconciliationThresholdSeconds?: number; // default: 300 (5 minutes)
}

/**
 * Compares two progress states to determine which is further ahead.
 * Returns:
 *   1 if a > b (a is further progressed)
 *  -1 if a < b (b is further progressed)
 *   0 if a == b (same position)
 */
export function compareProgress(a: ProgressState, b: ProgressState): number {
  if (a.page_index !== b.page_index) {
    return a.page_index > b.page_index ? 1 : -1;
  }
  if (a.block_index !== b.block_index) {
    return a.block_index > b.block_index ? 1 : -1;
  }
  if (a.word_index !== b.word_index) {
    return a.word_index > b.word_index ? 1 : -1;
  }
  return 0;
}

/**
 * Reconciles local and remote progress states using a progression-aware algorithm.
 */
export function reconcileProgress(
  local: ProgressState,
  remote: ProgressState,
  thresholdSeconds: number = 300
): ProgressState {
  const comparison = compareProgress(local, remote);

  if (comparison === 0) {
    return local.updated_at >= remote.updated_at ? local : remote;
  }

  if (comparison > 0) {
    // Local is further progressed than remote
    if (local.updated_at >= remote.updated_at) {
      return local;
    } else {
      // Local is further ahead but has an older timestamp (offline reading)
      const timeDiff = remote.updated_at - local.updated_at;
      return timeDiff < thresholdSeconds ? local : remote;
    }
  } else {
    // Remote is further progressed than local
    if (remote.updated_at >= local.updated_at) {
      return remote;
    } else {
      // Remote is further ahead but has an older timestamp
      const timeDiff = local.updated_at - remote.updated_at;
      return timeDiff < thresholdSeconds ? remote : local;
    }
  }
}

/**
 * In-memory fallback for LocalStore if none is provided.
 */
class MemoryLocalStore implements LocalStore {
  private cache = new Map<string, ProgressState>();

  async get(documentId: string): Promise<ProgressState | null> {
    const local = localStorage.getItem(`bimodal-progress:${documentId}`);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (e) {
        return null;
      }
    }
    return this.cache.get(documentId) || null;
  }

  async set(documentId: string, state: ProgressState): Promise<void> {
    this.cache.set(documentId, state);
    localStorage.setItem(`bimodal-progress:${documentId}`, JSON.stringify(state));
  }
}

export class BimodalSyncEngine {
  private config: Required<SyncEngineConfig>;
  private ws: WebSocket | null = null;
  private activeDocumentId: string | null = null;
  private currentLocalState: ProgressState | null = null;
  private isConnected = false;
  private reconnectTimeout: any = null;
  private reconnectDelay = 1000;
  private activeSubscriptionId: string | null = null;

  // Throttling state
  private lastPublishTime = 0;
  private pendingPublishTimeout: any = null;

  constructor(config: SyncEngineConfig) {
    this.config = {
      throttleMs: 3000,
      reconciliationThresholdSeconds: 300,
      localStore: new MemoryLocalStore(),
      ...config,
    };
  }

  /**
   * Initializes the engine for a specific document.
   * Loads local progress and establishes subscription on the relay.
   */
  async start(documentId: string) {
    this.activeDocumentId = documentId;
    this.currentLocalState = await this.config.localStore.get(documentId);

    this.connect();
  }

  /**
   * Stops the engine, closing connections and clearing timeouts.
   */
  stop() {
    this.clearPendingPublish();
    this.closeSubscription();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.isConnected = false;
    this.activeDocumentId = null;
  }

  /**
   * Records a new local progress state.
   * Instantly saves to local cache and schedules a throttled remote publish.
   */
  async updateLocalProgress(
    pageIndex: number,
    blockIndex: number,
    wordIndex: number,
    forceImmediatePublish = false
  ) {
    if (!this.activeDocumentId) return;

    const newState: ProgressState = {
      document_id: this.activeDocumentId,
      page_index: pageIndex,
      block_index: blockIndex,
      word_index: wordIndex,
      updated_at: Math.floor(Date.now() / 1000),
    };

    this.currentLocalState = newState;
    await this.config.localStore.set(this.activeDocumentId, newState);

    if (forceImmediatePublish) {
      this.clearPendingPublish();
      await this.publishProgress(newState);
    } else {
      this.scheduleThrottledPublish(newState);
    }
  }

  private connect() {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.config.relayUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectDelay = 1000; // Reset backoff
        this.subscribeToDocumentProgress();
      };

      this.ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          if (Array.isArray(message) && message[0] === "EVENT") {
            const subId = message[1];
            const nostrEvent: NostrEvent = message[2];

            if (subId === this.activeSubscriptionId && nostrEvent.kind === 30078) {
              await this.handleRemoteEvent(nostrEvent);
            }
          }
        } catch (err) {
          console.error("Error parsing Nostr message:", err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error("WebSocket error:", err);
      };
    } catch (err) {
      console.error("Failed to connect to Nostr relay:", err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      console.log(`Reconnecting to relay in ${this.reconnectDelay}ms...`);
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Exponential backoff up to 30s
    }, this.reconnectDelay);
  }

  private subscribeToDocumentProgress() {
    if (!this.ws || !this.isConnected || !this.activeDocumentId) return;

    this.activeSubscriptionId = `sub_progress_${this.activeDocumentId}_${Math.random().toString(36).substring(2, 9)}`;
    const dTag = `bimodal-reader:progress:${this.activeDocumentId}`;

    const subRequest = [
      "REQ",
      this.activeSubscriptionId,
      {
        kinds: [30078],
        authors: [this.config.userPubkey],
        "#d": [dTag],
        limit: 1,
      },
    ];

    this.ws.send(JSON.stringify(subRequest));
  }

  private closeSubscription() {
    if (this.ws && this.isConnected && this.activeSubscriptionId) {
      const closeRequest = ["CLOSE", this.activeSubscriptionId];
      this.ws.send(JSON.stringify(closeRequest));
      this.activeSubscriptionId = null;
    }
  }

  private async handleRemoteEvent(event: NostrEvent) {
    if (!this.activeDocumentId) return;

    try {
      const remoteState: ProgressState = JSON.parse(event.content);
      if (remoteState.document_id !== this.activeDocumentId) return;

      const localState = this.currentLocalState;

      if (!localState) {
        // No local state exists, apply remote state immediately
        this.currentLocalState = remoteState;
        await this.config.localStore.set(this.activeDocumentId, remoteState);
        this.config.onRemoteProgressApplied(remoteState);
        return;
      }

      // Reconcile states
      const reconciled = reconcileProgress(
        localState,
        remoteState,
        this.config.reconciliationThresholdSeconds
      );

      if (reconciled === remoteState) {
        // Remote state won the reconciliation; update local state and notify UI
        this.currentLocalState = remoteState;
        await this.config.localStore.set(this.activeDocumentId, remoteState);
        this.config.onRemoteProgressApplied(remoteState);
      } else if (reconciled === localState && compareProgress(localState, remoteState) !== 0) {
        // Local state won and is different from remote; publish local state to sync remote
        await this.publishProgress(localState);
      }
    } catch (err) {
      console.error("Error handling remote progress event:", err);
    }
  }

  private scheduleThrottledPublish(state: ProgressState) {
    const now = Date.now();
    const timeSinceLastPublish = now - this.lastPublishTime;

    this.clearPendingPublish();

    if (timeSinceLastPublish >= this.config.throttleMs) {
      this.publishProgress(state);
    } else {
      const delay = this.config.throttleMs - timeSinceLastPublish;
      this.pendingPublishTimeout = setTimeout(() => {
        this.publishProgress(state);
      }, delay);
    }
  }

  private clearPendingPublish() {
    if (this.pendingPublishTimeout) {
      clearTimeout(this.pendingPublishTimeout);
      this.pendingPublishTimeout = null;
    }
  }

  private async publishProgress(state: ProgressState) {
    if (!this.ws || !this.isConnected || !this.activeDocumentId) return;

    this.lastPublishTime = Date.now();

    try {
      const dTag = `bimodal-reader:progress:${this.activeDocumentId}`;
      const unsignedEvent: NostrEvent = {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["d", dTag]],
        content: JSON.stringify(state),
      };

      const signedEvent = await this.config.signEvent(unsignedEvent);
      const publishMessage = ["EVENT", signedEvent];
      this.ws.send(JSON.stringify(publishMessage));
    } catch (err) {
      console.error("Failed to publish progress to Nostr relay:", err);
    }
  }
}
