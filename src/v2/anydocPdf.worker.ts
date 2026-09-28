import wasmUrl from '@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm?url';
import init, { toMarkdownBytes } from '@firecrawl/anydoc-wasm';

type ConvertRequest = {
  id: number;
  data: ArrayBuffer;
  retry?: boolean;
};

type ConvertResponse = {
  id: number;
  markdown?: string;
  ready?: boolean;
  error?: {
    message: string;
    code?: string;
  };
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ConvertRequest>) => void) | null;
  postMessage: (message: ConvertResponse) => void;
};



workerScope.onmessage = (event) => {
  const { id, data, retry } = event.data;
  void (async () => {
    try {
      const response = await fetch(wasmUrl, { cache: retry ? 'reload' : 'default' });
      if (!response.ok) throw new Error(`AnyDoc engine download failed (HTTP ${response.status}).`);
      await init({ module_or_path: response });
    } catch {
      workerScope.postMessage({id,error:{code:'ASSET_LOAD_FAILED',message:'AnyDoc engine could not load. Check your connection; if this persists, save your work and refresh the app.'}});
      return;
    }
    workerScope.postMessage({id,ready:true});
    try {
      workerScope.postMessage({id,markdown:toMarkdownBytes(new Uint8Array(data),'pdf')});
    } catch (error) {
      workerScope.postMessage({id,error:{code:'CONVERSION_FAILED',message:error instanceof Error?error.message:'AnyDoc could not convert this PDF.'}});
    }
  })();
};
