import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  try {
    // Primary: locally hosted worker in /public/assets/
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.worker.min.mjs';
  } catch (e) {
    // Fallback: unpkg CDN matching library version
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
}

interface SecurePdfCanvasViewerProps {
  source: string; // base64 data URL, blob URL, or direct authenticated URL
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

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const renderTaskRef = useRef<any>(null);

  // Load PDF Document
  useEffect(() => {
    let isCancelled = false;

    async function loadPdf() {
      try {
        setLoading(true);
        setErrorMsg('');
        setPdfDoc(null);
        setCurrentPage(1);

        let loadingTask: any;

        if (source.startsWith('data:')) {
          // Base64 data URL -> convert to Uint8Array for maximum speed & stability
          const base64Data = source.split(',')[1];
          const binaryString = atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          loadingTask = pdfjsLib.getDocument({ data: bytes });
        } else {
          // URL source
          loadingTask = pdfjsLib.getDocument({
            url: source,
            withCredentials: true,
          });
        }

        const loadedDoc = await loadingTask.promise;
        if (isCancelled) return;

        setPdfDoc(loadedDoc);
        setTotalPages(loadedDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        if (isCancelled) return;
        console.error('[PDF.js] Failed to load document:', err);
        setErrorMsg(err.message || 'Failed to parse PDF document.');
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

  // Render current page onto Canvas
  const renderCurrentPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      setRendering(true);

      // Cancel previous render if in progress
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel error
        }
      }

      const page = await pdfDoc.getPage(currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const viewport = page.getViewport({ scale: zoomLevel, rotation });

      // HiDPI / Retina display crisp rendering
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(outputScale, outputScale);

      // Clear previous canvas drawing
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

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(2.5, +(prev + 0.25).toFixed(2)));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(0.5, +(prev - 0.25).toFixed(2)));
  };

  const handleFitWidth = () => {
    if (!containerRef.current || !pdfDoc) return;
    pdfDoc.getPage(currentPage).then((page: any) => {
      const defaultViewport = page.getViewport({ scale: 1.0, rotation });
      const containerWidth = containerRef.current?.clientWidth || 600;
      const targetScale = Math.max(0.6, (containerWidth - 64) / defaultViewport.width);
      setZoomLevel(+targetScale.toFixed(2));
    });
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col w-full h-full bg-slate-900 rounded-lg overflow-hidden select-none ${className}`}
    >
      {/* Viewer Control Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-950/80 border-b border-slate-800 text-xs text-slate-300 shrink-0 z-10 flex-wrap gap-2">
        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-mono text-[11px] px-1 text-slate-200 tabular-nums">
            Page {currentPage} of {totalPages || 1}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={currentPage >= totalPages || loading || rendering}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent text-slate-300 hover:text-white transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom & Rotation Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoomLevel <= 0.5 || loading}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono text-[11px] w-12 text-center text-amber-300 font-semibold tabular-nums">
            {Math.round(zoomLevel * 100)}%
          </span>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoomLevel >= 2.5 || loading}
            className="p-1 rounded hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleFitWidth}
            className="px-2 py-0.5 text-[11px] font-medium rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors ml-1 border border-slate-700/60"
            title="Fit to Container Width"
          >
            Fit
          </button>

          <button
            type="button"
            onClick={handleRotate}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors ml-1"
            title="Rotate Clockwise (90°)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Canvas Viewport Area */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative bg-slate-900/90">
        {loading && (
          <div className="flex flex-col items-center justify-center space-y-3 py-16 text-slate-400">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-medium text-slate-300">Decrypting & rendering in-app PDF...</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-6 bg-slate-950/80 rounded-xl border border-rose-500/40 text-center max-w-md mx-auto space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Document Rendering Notice</h4>
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
          className={`shadow-2xl rounded-sm transition-opacity duration-150 ${
            loading || errorMsg ? 'hidden' : 'block'
          } ${rendering ? 'opacity-85' : 'opacity-100'}`}
        />
      </div>

      {/* Bottom Status Ribbon */}
      <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1 font-mono truncate">
          <FileText className="w-3 h-3 text-amber-400 shrink-0" />
          {fileName || 'PDF Document'}
        </span>
        <span className="font-mono text-emerald-400 shrink-0">
          Native Canvas In-App Renderer (No Iframe)
        </span>
      </div>
    </div>
  );
};
