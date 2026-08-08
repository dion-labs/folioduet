type ConvertResponse = {
  id: number;
  markdown?: string;
  error?: {
    message: string;
    code?: string;
  };
};

let nextRequestId = 0;

function createAnydocWorker(): Worker {
  return new Worker(new URL('./anydocPdf.worker.ts', import.meta.url), { type: 'module' });
}

export function normalizeAnydocMarkdown(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  return normalized ? [`${normalized}\n`] : [];
}

/** Convert a PDF locally in a worker so the synchronous WASM API cannot freeze the reader UI. */
export async function extractPdfWithAnydoc(file: File): Promise<string[]> {
  const data = await file.arrayBuffer();
  const worker = createAnydocWorker();
  const id = nextRequestId += 1;

  return new Promise<string[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ConvertResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.error) {
        const error = new Error(event.data.error.message) as Error & { code?: string };
        error.code = event.data.error.code;
        reject(error);
        return;
      }
      resolve(normalizeAnydocMarkdown(event.data.markdown ?? ''));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'AnyDoc worker failed.'));
    };
    worker.postMessage({ id, data }, [data]);
  });
}
