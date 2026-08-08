import init, { toMarkdownBytes } from '@firecrawl/anydoc-wasm';

type ConvertRequest = {
  id: number;
  data: ArrayBuffer;
};

type ConvertResponse = {
  id: number;
  markdown?: string;
  error?: {
    message: string;
    code?: string;
  };
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
  postMessage: (message: ConvertResponse) => void;
};

const ready = init();

workerScope.onmessage = (event) => {
  const { id, data } = event.data;
  void ready.then(() => {
    const markdown = toMarkdownBytes(new Uint8Array(data), 'pdf');
    workerScope.postMessage({ id, markdown });
  }).catch((error: unknown) => {
    const detail = error && typeof error === 'object'
      ? error as { message?: unknown; code?: unknown }
      : null;
    workerScope.postMessage({
      id,
      error: {
        message: typeof detail?.message === 'string'
          ? detail.message
          : 'AnyDoc could not convert this PDF.',
        code: typeof detail?.code === 'string' ? detail.code : undefined,
      },
    });
  });
};
