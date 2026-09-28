import workerUrl from './anydocPdf.worker.ts?worker&url';
import { AssetLoadError, notifyAssetFailure } from './assetRecovery';
type ConvertResponse = {
  id: number;
  markdown?: string;
  error?: {
    message: string;
    code?: string;
  };
};

let nextRequestId = 0;

async function createAnydocWorker(retry: boolean): Promise<Worker> {
  try {
    if (retry) {
      const response = await fetch(workerUrl, { cache: 'reload', signal: AbortSignal.timeout(20000) });
      if (!response.ok || /text\/html/i.test(response.headers.get('Content-Type') || '')) {
        throw new Error('Missing worker asset');
      }
    }
    return new Worker(workerUrl, { type: 'module' });
  } catch {
    throw new AssetLoadError('AnyDoc assets could not load. Check your connection; save your work and refresh if this persists.');
  }
}

/** Convert a PDF locally in a worker so the synchronous WASM API cannot freeze the reader UI. */
async function attempt(file: File, retry: boolean): Promise<string[]> {
  const data = await file.arrayBuffer();
  const worker = await createAnydocWorker(retry);
  const id = nextRequestId += 1;

  return new Promise<string[]>((resolve, reject) => {
    let ready = false;
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new AssetLoadError('AnyDoc took too long to load.'));
    }, 20000);
    worker.onmessage = (event: MessageEvent<ConvertResponse>) => {
      if (event.data.id !== id) return;
      clearTimeout(timeout);
      if ((event.data as ConvertResponse & {ready?:boolean}).ready) { ready = true; return; }
      worker.terminate();
      if (event.data.error) {
        const error = (event.data.error.code === 'ASSET_LOAD_FAILED' ? new AssetLoadError(event.data.error.message) : new Error(event.data.error.message)) as Error & { code?: string };
        error.code = event.data.error.code;
        reject(error);
        return;
      }
      // Adapter returns raw engine output; common processing belongs to the caller.
      resolve([event.data.markdown ?? '']);
    };
    worker.onerror = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(ready ? new Error('AnyDoc failed while converting this PDF.') : new AssetLoadError(event.message || 'AnyDoc worker failed to load.'));
    };
    worker.postMessage({ id, data, retry }, [data]);
  });
}

export async function extractPdfWithAnydoc(file: File): Promise<string[]> {
  try { return await attempt(file, false); }
  catch (error) {
    if (!(error instanceof AssetLoadError)) throw error;
    try { return await attempt(file, true); }
    catch (retryError) {
      if (retryError instanceof AssetLoadError) notifyAssetFailure();
      throw retryError;
    }
  }
}
