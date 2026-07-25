import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { tokenizeBlock, generateSpannedHTML } from '../hooks/useTTS';

// Bundle the worker with the app so reading remains available offline.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface BimodalPDFViewerProps {
  pdfUrl: string | File;
  pageIndex: number;
  activeBlockIndex: number | null;
  activeWordIndex: number | null;
  scale: number;
  onTextExtracted: (blocks: string[]) => void;
  onNextPageTextExtracted?: (pageIndex: number, blocks: string[]) => void;
  onWordTap: (blockIndex: number, wordIndex: number) => void;
  onPageLoadSuccess: (numPages: number) => void;
  isPlaying?: boolean;
  isPaused?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const BimodalPDFViewer: React.FC<BimodalPDFViewerProps> = ({
  pdfUrl,
  pageIndex,
  activeBlockIndex,
  activeWordIndex,
  scale,
  onTextExtracted,
  onNextPageTextExtracted,
  onWordTap,
  onPageLoadSuccess,
  isPlaying = false,
  isPaused = false,
  className = '',
  style = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeRenderTaskRef = useRef<any>(null);
  const activeTextLayerRef = useRef<any>(null);

  const onPageLoadSuccessRef = useRef(onPageLoadSuccess);
  const onTextExtractedRef = useRef(onTextExtracted);
  const onNextPageTextExtractedRef = useRef(onNextPageTextExtracted);

  useEffect(() => {
    onPageLoadSuccessRef.current = onPageLoadSuccess;
    onTextExtractedRef.current = onTextExtracted;
    onNextPageTextExtractedRef.current = onNextPageTextExtracted;
  });

  // Load PDF Document
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loadDoc = async () => {
      try {
        let loadingTask;
        if (typeof pdfUrl === 'string') {
          if (pdfUrl.startsWith('blob:')) {
            const res = await fetch(pdfUrl);
            const arrayBuffer = await res.arrayBuffer();
            loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
          } else {
            loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
          }
        } else if (pdfUrl instanceof File) {
          const arrayBuffer = await pdfUrl.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        } else {
          throw new Error('Unsupported PDF source format');
        }

        const doc = await loadingTask.promise;
        if (active) {
          setPdfDoc(doc);
          if (onPageLoadSuccessRef.current) {
            onPageLoadSuccessRef.current(doc.numPages);
          }
        }
      } catch (err: any) {
        console.error('Error loading PDF document:', err);
        if (active) {
          setError(`Failed to load PDF: ${err.message || err}`);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDoc();

    return () => {
      active = false;
    };
  }, [pdfUrl]);

  // Render Page Canvas and Text Layer
  useEffect(() => {
    if (!pdfDoc) return;

    let active = true;
    const renderPage = async () => {
      // Cancel any ongoing render tasks
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
        activeRenderTaskRef.current = null;
      }
      if (activeTextLayerRef.current) {
        activeTextLayerRef.current.cancel();
        activeTextLayerRef.current = null;
      }

      try {
        const pageNumber = Math.min(pdfDoc.numPages, Math.max(1, pageIndex + 1));
        const page = await pdfDoc.getPage(pageNumber); // PDF.js uses 1-based page indexes.
        if (!active) return;

        const viewport = page.getViewport({ scale });

        // 1. Render Canvas
        const canvas = canvasRef.current;
        if (canvas) {
          const context = canvas.getContext('2d');
          if (context) {
            // Support high-DPI displays
            const dpr = window.devicePixelRatio || 1;
            canvas.width = viewport.width * dpr;
            canvas.height = viewport.height * dpr;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            context.scale(dpr, dpr);

            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };

            const renderTask = page.render(renderContext);
            activeRenderTaskRef.current = renderTask;
            await renderTask.promise;
          }
        }

        if (!active) return;

        // 2. Render Text Layer
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          textLayerDiv.style.left = '0';
          textLayerDiv.style.top = '0';

          const textContent = await page.getTextContent();
          if (!active) return;

          // Extract text blocks and notify parent
          const blocks = textContent.items.map((item: any) => item.str);
          if (onTextExtractedRef.current) {
            onTextExtractedRef.current(blocks);
          }

          if (pageNumber < pdfDoc.numPages && onNextPageTextExtractedRef.current) {
            void pdfDoc.getPage(pageNumber + 1)
              .then((nextPage) => nextPage.getTextContent())
              .then((nextTextContent) => {
                if (!active || !onNextPageTextExtractedRef.current) return;
                const nextBlocks = nextTextContent.items.map((item: any) => item.str);
                onNextPageTextExtractedRef.current(pageNumber, nextBlocks);
              })
              .catch((nextPageError) => {
                if (active) {
                  console.warn('Could not preload the next PDF text layer:', nextPageError);
                }
              });
          }

          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
          });

          activeTextLayerRef.current = textLayer;
          await textLayer.render();

          if (!active) return;

          // Post-process standard spans into word-level spanned elements
          const textDivs = textLayer.textDivs;
          textDivs.forEach((textDiv, blockIndex) => {
            const originalText = textDiv.textContent || '';
            const tokens = tokenizeBlock(originalText);
            textDiv.setAttribute('data-block-idx', blockIndex.toString());
            textDiv.innerHTML = generateSpannedHTML(originalText, tokens);
          });
        }
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') {
          // Normal cancellation, ignore
          return;
        }
        console.error('Error rendering page:', err);
        setError(`Failed to render page: ${err.message || err}`);
      }
    };

    renderPage();

    return () => {
      active = false;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
      }
      if (activeTextLayerRef.current) {
        activeTextLayerRef.current.cancel();
      }
    };
  }, [pdfDoc, pageIndex, scale]);

  // Handle dynamic word-level highlighting
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container) return;

    // Remove previous highlights
    const previousHighlights = container.querySelectorAll('.active-word-highlight, .active-word-highlight-paused, .active-word-highlight-stopped');
    previousHighlights.forEach((el) => {
      el.classList.remove('active-word-highlight', 'active-word-highlight-paused', 'active-word-highlight-stopped');
    });

    // Add new highlight
    if (activeBlockIndex !== null && activeWordIndex !== null) {
      const activeSpan = container.querySelector(
        `[data-block-idx="${activeBlockIndex}"] [data-word-idx="${activeWordIndex}"]`
      );
      if (activeSpan) {
        let highlightClass = 'active-word-highlight';
        if (!isPlaying) {
          highlightClass = 'active-word-highlight-stopped';
        } else if (isPaused) {
          highlightClass = 'active-word-highlight-paused';
        }
        activeSpan.classList.add(highlightClass);
        
        // Smoothly scroll active word into view if needed
        activeSpan.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
    }
  }, [activeBlockIndex, activeWordIndex, isPlaying, isPaused]);

  // Event delegation for word clicks (tap-to-seek)
  const handleTextLayerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const wordSpan = target.closest('.tts-word');
    if (wordSpan) {
      const wordIdxAttr = wordSpan.getAttribute('data-word-idx');
      const blockDiv = wordSpan.closest('[data-block-idx]');
      if (wordIdxAttr && blockDiv) {
        const wordIndex = parseInt(wordIdxAttr, 10);
        const blockIndex = parseInt(blockDiv.getAttribute('data-block-idx') || '0', 10);
        onWordTap(blockIndex, wordIndex);
      }
    }
  };

  if (loading) {
    return (
      <div 
        className={`flex flex-col items-center justify-center border rounded-2xl shadow-xl bg-white dark:bg-slate-900 transition-all duration-300 ${className}`}
        style={{ height: 'calc(100vh - 220px)', minHeight: '500px', ...style }}
      >
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
        <p className="mt-4 text-gray-500 dark:text-slate-400 font-medium">Preparing your reading experience... 🐝</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 h-96 text-red-500">
        <svg className="h-12 w-12 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="font-semibold text-lg">Oh honeycomb, we hit a snag!</p>
        <p className="mt-2 text-sm text-gray-600 bg-red-50 px-4 py-2 rounded border border-red-100 max-w-md text-center">{error}</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef} 
      className={`relative border overflow-auto max-w-full mx-auto transition-all duration-300 pt-10 pb-10 ${className}`}
      style={{ maxHeight: 'calc(100vh - 220px)', ...style }}
    >
      <div className="relative select-text" style={{ width: 'fit-content', margin: '0 auto' }}>
        {/* Base Layer: PDF Canvas */}
        <canvas ref={canvasRef} className="block" />

        {/* Interactive Overlay Layer */}
        <div 
          ref={textLayerRef} 
          className="textLayer absolute inset-0 pointer-events-auto cursor-text"
          onClick={handleTextLayerClick}
        />
      </div>
    </div>
  );
};
