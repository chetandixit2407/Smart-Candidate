import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  AlertCircle,
  RefreshCw,
  Expand,
  Maximize2,
} from 'lucide-react';

// Configure PDF.js worker to strictly match installed library version (6.5.438)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    pdfWorker || `/assets/pdf.worker.min.mjs?v=${pdfjsLib.version || '6.5.438'}`;
}

interface SecurePdfCanvasViewerProps {
  source: string; // base64 data URL, blob URL, or authenticated URL
  fileName?: string;
  className?: string;
}

export const SecurePdfCanvasViewer: React.FC<SecurePdfCanvasViewerProps> = ({
  source,
  fileName,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportScrollRef = useRef<HTMLDivElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [pageInputVal, setPageInputVal] = useState<string>('1');

  const renderTaskRef = useRef<any>(null);
  const hasAutoFittedRef = useRef<boolean>(false);

  // Load PDF Document from source
  useEffect(() => {
    let isCancelled = false;
    hasAutoFittedRef.current = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setErrorMsg('');
        setPdfDoc(null);
        setCurrentPage(1);
        setPageInputVal('1');

        let dataBytes: Uint8Array | null = null;

        if (source.startsWith('data:')) {
          // Base64 data URL
          const parts = source.split(',');
          const base64Data = parts[1] || '';
          let binaryString = atob(base64Data);
          if (binaryString.startsWith('JVBERi')) {
            try {
              binaryString = atob(binaryString.trim());
            } catch {
              // ignore
            }
          }
          const len = binaryString.length;
          dataBytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            dataBytes[i] = binaryString.charCodeAt(i);
          }
        } else {
          // Fetch from URL or Blob URL
          const response = await fetch(source, { credentials: 'include' });
          if (!response.ok) {
            throw new Error(`Failed to load document (HTTP ${response.status})`);
          }
          const arrayBuffer = await response.arrayBuffer();
          let bytes = new Uint8Array(arrayBuffer);

          // Check if payload is ASCII base64 (e.g. starts with JVBERi)
          if (
            bytes.length > 6 &&
            bytes[0] === 0x4a && // 'J'
            bytes[1] === 0x56 && // 'V'
            bytes[2] === 0x42 && // 'B'
            bytes[3] === 0x45 // 'E'
          ) {
            try {
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(bytes).trim();
              let binStr = atob(text);
              if (binStr.startsWith('JVBERi')) {
                binStr = atob(binStr.trim());
              }
              const decoded = new Uint8Array(binStr.length);
              for (let i = 0; i < binStr.length; i++) {
                decoded[i] = binStr.charCodeAt(i);
              }
              bytes = decoded;
            } catch {
              // ignore
            }
          }
          dataBytes = bytes;
        }

        if (isCancelled) return;

        if (!dataBytes || dataBytes.length === 0) {
          throw new Error('Empty document received.');
        }

        // Check for %PDF- within the first 1024 bytes
        const checkLen = Math.min(dataBytes.length, 1024);
        let hasHeader = false;
        for (let i = 0; i <= checkLen - 5; i++) {
          if (
            dataBytes[i] === 0x25 && // %
            dataBytes[i + 1] === 0x50 && // P
            dataBytes[i + 2] === 0x44 && // D
            dataBytes[i + 3] === 0x46 && // F
            dataBytes[i + 4] === 0x2d // -
          ) {
            hasHeader = true;
            break;
          }
        }

        if (!hasHeader) {
          setErrorMsg('The document file is not a valid PDF or has an unreadable header format.');
          setLoading(false);
          return;
        }

        const loadingTask = pdfjsLib.getDocument({
          data: dataBytes,
          cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/cmaps/',
          cMapPacked: true,
        });

        const loadedDoc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        const msg = String(err?.message || '');
        if (msg.includes('Invalid PDF structure') || err?.name === 'InvalidPDFException') {
          setErrorMsg('This document file contains an invalid or incomplete internal PDF structure.');
        } else {
          setErrorMsg(msg || 'Failed to parse PDF document.');
        }
        setLoading(false);
      }
    }

    if (source) {
      loadPdf();
    }

    return () => {
      isCancelled = true;
    };
  }, [source]);

  // Auto-fit page width on initial load
  const autoFitWidth = useCallback(
    async (doc: any, pageNum: number) => {
      if (!doc || !viewportScrollRef.current) return;
      try {
        const page = await doc.getPage(pageNum);
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
        const availWidth = (viewportScrollRef.current.clientWidth || 600) - 32; // subtract 32px padding
        if (availWidth > 0 && unscaledViewport.width > 0) {
          const fitted = Math.min(2.0, Math.max(0.3, availWidth / unscaledViewport.width));
          setZoomLevel(+fitted.toFixed(2));
        }
      } catch {
        // Fallback default
        setZoomLevel(1.0);
      }
    },
    [rotation]
  );

  useEffect(() => {
    if (pdfDoc && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true;
      autoFitWidth(pdfDoc, currentPage);
    }
  }, [pdfDoc, currentPage, autoFitWidth]);

  // Render current page on HTML5 Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      setRendering(true);

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }

      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = page.getViewport({ scale: zoomLevel, rotation });

      // HiDPI / Retina crisp rendering
      const outputScale = Math.min(2.5, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const renderContext = {
        canvasContext: ctx,
        viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;

      ctx.restore();
      setRendering(false);
      setPageInputVal(String(currentPage));
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('[PDF.js] Page render error:', err);
      }
      setRendering(false);
    }
  }, [pdfDoc, currentPage, zoomLevel, rotation]);

  useEffect(() => {
    renderCurrentPage();
  }, [renderCurrentPage]);

  // Page Navigation Handlers
  const goToPage = (p: number) => {
    const target = Math.max(1, Math.min(totalPages || 1, p));
    setCurrentPage(target);
    setPageInputVal(String(target));
    if (viewportScrollRef.current) {
      viewportScrollRef.current.scrollTop = 0;
    }
  };

  const handlePrevPage = () => goToPage(currentPage - 1);
  const handleNextPage = () => goToPage(currentPage + 1);
  const handleFirstPage = () => goToPage(1);
  const handleLastPage = () => goToPage(totalPages);

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(pageInputVal, 10);
    if (!isNaN(parsed)) {
      goToPage(parsed);
    } else {
      setPageInputVal(String(currentPage));
    }
  };

  // Zoom Handlers
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(3.0, +(prev + 0.2).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(0.3, +(prev - 0.2).toFixed(2)));
  };

  const handleFitWidth = async () => {
    if (!viewportScrollRef.current || !pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const defaultViewport = page.getViewport({ scale: 1.0, rotation });
      const availWidth = (viewportScrollRef.current.clientWidth || 600) - 32;
      if (availWidth > 0 && defaultViewport.width > 0) {
        const targetScale = Math.min(3.0, Math.max(0.3, availWidth / defaultViewport.width));
        setZoomLevel(+targetScale.toFixed(2));
      }
    } catch {
      setZoomLevel(1.0);
    }
  };

  const handleFitPage = async () => {
    if (!viewportScrollRef.current || !pdfDoc) return;
    try {
      const page = await pdfDoc.getPage(currentPage);
      const defaultViewport = page.getViewport({ scale: 1.0, rotation });
      const availWidth = (viewportScrollRef.current.clientWidth || 600) - 32;
      const availHeight = (viewportScrollRef.current.clientHeight || 500) - 32;
      if (availWidth > 0 && availHeight > 0 && defaultViewport.width > 0 && defaultViewport.height > 0) {
        const scaleW = availWidth / defaultViewport.width;
        const scaleH = availHeight / defaultViewport.height;
        const targetScale = Math.min(3.0, Math.max(0.3, Math.min(scaleW, scaleH)));
        setZoomLevel(+targetScale.toFixed(2));
      }
    } catch {
      setZoomLevel(1.0);
    }
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      handlePrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      handleNextPage();
    } else if (e.key === 'Home') {
      e.preventDefault();
      handleFirstPage();
    } else if (e.key === 'End') {
      e.preventDefault();
      handleLastPage();
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col w-full h-full bg-slate-900 rounded-xl overflow-hidden select-none border border-slate-800 ${className}`}
    >
      {/* Control Bar: Compact & Responsive on Mobile/Tablet */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 text-xs text-slate-300 shrink-0 z-10 flex-wrap gap-2">
        {/* Page Navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleFirstPage}
            disabled={currentPage <= 1 || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="First Page (Home)"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="Previous Page (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={pageInputVal}
              onChange={e => setPageInputVal(e.target.value)}
              onBlur={() => setPageInputVal(String(currentPage))}
              disabled={loading || rendering}
              className="w-10 px-1 py-0.5 text-center font-mono text-xs font-semibold bg-slate-800 border border-slate-700 rounded text-amber-300 focus:outline-none focus:border-amber-400"
            />
            <span className="font-mono text-[11px] text-slate-400">of {totalPages || 1}</span>
          </form>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="Next Page (Right Arrow)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleLastPage}
            disabled={currentPage >= totalPages || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="Last Page (End)"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom, Fit & Rotate Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.3 || loading}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="font-mono text-[11px] w-12 text-center text-amber-300 font-bold tabular-nums">
            {Math.round(zoomLevel * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 3.0 || loading}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handleFitWidth}
            disabled={loading}
            className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-800 text-slate-200 hover:text-white transition-colors border border-slate-700/80"
            title="Fit Full Page Width"
          >
            Fit Width
          </button>

          <button
            type="button"
            onClick={handleFitPage}
            disabled={loading}
            className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-800 text-slate-200 hover:text-white transition-colors border border-slate-700/80 hidden xs:inline-block"
            title="Fit Entire Page in View"
          >
            Fit Page
          </button>

          <button
            type="button"
            onClick={() => setZoomLevel(1.0)}
            disabled={loading}
            className="px-1.5 py-0.5 text-[11px] font-mono rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors hidden sm:inline-block"
            title="Reset to 100%"
          >
            100%
          </button>

          <button
            type="button"
            onClick={handleRotate}
            disabled={loading}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="Rotate Clockwise (90°)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Viewport Area: Full height, natural vertical scrolling from top to bottom, no top cutoff */}
      <div
        ref={viewportScrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-x-auto overflow-y-auto p-2 sm:p-4 bg-slate-900/95 focus:outline-none min-h-0"
      >
        <div className="min-w-full min-h-full flex flex-col items-center justify-start my-auto py-2">
          {loading && (
            <div className="flex flex-col items-center justify-center space-y-3 py-16 text-slate-400 m-auto">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-medium text-slate-300">
                Decrypting & rendering in-app PDF...
              </span>
            </div>
          )}

          {errorMsg && (
            <div className="p-6 bg-slate-950/90 rounded-xl border border-rose-500/40 text-center max-w-md mx-auto space-y-3 m-auto shadow-2xl">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Document Rendering Notice
              </h4>
              <p className="text-xs text-rose-300 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setLoading(true);
                  renderCurrentPage();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg inline-flex items-center gap-1.5 border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Rendering
              </button>
            </div>
          )}

          <canvas
            ref={canvasRef}
            className={`shadow-2xl rounded-sm transition-opacity duration-150 max-w-none ${
              loading || errorMsg ? 'hidden' : 'block'
            } ${rendering ? 'opacity-85' : 'opacity-100'}`}
          />
        </div>
      </div>

      {/* Bottom Status Ribbon */}
      <div className="px-3 py-1.5 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5 font-mono truncate">
          <FileText className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{fileName || 'PDF Document'}</span>
        </span>
        <span className="font-mono text-emerald-400 shrink-0 hidden sm:inline">
          High-Fidelity PDF Canvas Engine
        </span>
      </div>
    </div>
  );
};
