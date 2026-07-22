"use client";

import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

// Set worker source to self-hosted worker
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface PdfReaderProps {
  previewUrl: string;
  title?: string;
}

export function PdfReader({ previewUrl, title }: PdfReaderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const loadingTask = pdfjsLib.getDocument({
      url: previewUrl,
      withCredentials: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!active) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        console.error("Failed to load PDF:", err);
        setError("Failed to load PDF document.");
        setLoading(false);
      });

    return () => {
      active = false;
      loadingTask.destroy();
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let active = true;
    let renderTask: pdfjsLib.RenderTask | null = null;

    pdfDoc.getPage(pageNum).then((page) => {
      if (!active || !canvasRef.current) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport,
        canvas: canvas,
      };

      renderTask = page.render(renderContext);
      renderTask.promise.catch((err) => {
        if (err.name !== "RenderingCancelledException") {
          console.error("Page render error:", err);
        }
      });
    });

    return () => {
      active = false;
      if (renderTask) {
        renderTask.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="flex flex-col items-center w-full max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Reader Controls Toolbar */}
      <div className="w-full bg-gray-900 text-white px-6 py-3 flex flex-wrap items-center justify-between gap-4 select-none">
        <div className="text-sm font-medium truncate max-w-md">
          {title || "PDF Document"}
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setPageNum((prev) => Math.max(prev - 1, 1))}
            disabled={pageNum <= 1 || loading}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs rounded transition-colors"
            aria-label="Previous Page"
          >
            Previous
          </button>
          <span className="text-xs text-gray-300">
            Page {pageNum} of {numPages || "--"}
          </span>
          <button
            onClick={() => setPageNum((prev) => Math.min(prev + 1, numPages))}
            disabled={pageNum >= numPages || loading}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs rounded transition-colors"
            aria-label="Next Page"
          >
            Next
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setScale((prev) => Math.max(prev - 0.2, 0.6))}
            disabled={loading}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs rounded"
            aria-label="Zoom Out"
          >
            -
          </button>
          <span className="text-xs text-gray-300 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((prev) => Math.min(prev + 0.2, 2.5))}
            disabled={loading}
            className="px-2 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs rounded"
            aria-label="Zoom In"
          >
            +
          </button>
        </div>
      </div>

      {/* Reader Canvas Area */}
      <div className="w-full p-8 flex justify-center bg-gray-100 min-h-[600px] overflow-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center text-gray-500 my-24 space-y-2">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium">Loading document reader...</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center text-red-600 my-24 space-y-2">
            <p className="font-semibold">{error}</p>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className={`shadow-lg rounded bg-white transition-opacity ${
            loading || error ? "hidden" : "block"
          }`}
        />
      </div>
    </div>
  );
}
