"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfPageViewProps = {
  source: string;
  page: number;
};

const RENDER_TIMEOUT_MS = 15000;

export default function PdfPageView({ source, page }: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDocument: PDFDocumentProxy | null = null;
    let loadingTask: { destroy(): void; promise: Promise<PDFDocumentProxy> } | null = null;
    let activeRenderTask: { cancel(): void; promise: Promise<void> } | null = null;
    let timeoutId: number | null = null;
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const renderPage = async () => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const pdfjs = await import("pdfjs-dist");
        const { getDocument, GlobalWorkerOptions } = pdfjs;

        GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";

        timeoutId = window.setTimeout(() => {
          if (cancelled) {
            return;
          }

          activeRenderTask?.cancel();
          loadingTask?.destroy();

          setStatus("error");
          setErrorMessage("Timed out while rendering this PDF page.");
        }, RENDER_TIMEOUT_MS);

        loadingTask = getDocument(`/pdfs/${source}`);
        const loadedPdfDocument = await loadingTask.promise;

        if (cancelled) {
          return;
        }

        pdfDocument = loadedPdfDocument;

        const pdfPage = await loadedPdfDocument.getPage(page);

        if (cancelled) {
          return;
        }

        const initialViewport = pdfPage.getViewport({ scale: 1 });
        const containerWidth = canvas.parentElement?.clientWidth ?? initialViewport.width;
        const scale = Math.max(containerWidth / initialViewport.width, 1);
        const viewport = pdfPage.getViewport({ scale });
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas context is not available.");
        }

        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        activeRenderTask = pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        });

        await activeRenderTask.promise;

        if (!cancelled) {
          if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }

          setStatus("ready");
        }
      } catch (error) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (
          cancelled ||
          (error instanceof Error &&
            (error.name === "RenderingCancelledException" ||
              error.message.includes("multiple render() operations")))
        ) {
          return;
        }

        console.error("PDF render failed:", error);

        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to render this PDF page."
        );
      }
    };

    void renderPage();

    return () => {
      cancelled = true;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      activeRenderTask?.cancel();
      activeRenderTask = null;
      loadingTask?.destroy();
      loadingTask = null;

      if (pdfDocument) {
        void pdfDocument.destroy();
      }
    };
  }, [page, source]);

  return (
    <div className="space-y-3">
      {status === "loading" ? (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900/70 px-4 py-3 text-sm text-zinc-400">
          Loading page preview...
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {errorMessage ?? "Unable to render this PDF page."}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-white shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
        <canvas
          ref={canvasRef}
          className={`block w-full ${status === "ready" ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
