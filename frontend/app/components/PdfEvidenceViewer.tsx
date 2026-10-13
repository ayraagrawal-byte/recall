"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Keep pdfjs-dist at the same version as React-PDF's PDF.js dependency.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Props = {
  url: string;
  filename: string;
  initialPage: number | null;
  evidence?: string | null;
  onClose: () => void;
};

function normalize(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => {
    const escapes: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return escapes[char];
  });
}

export default function PdfEvidenceViewer({ url, filename, initialPage, evidence, onClose }: Props) {
  const [page, setPage] = useState(Math.max(1, initialPage ?? 1));
  const [pages, setPages] = useState(0);
  const [width, setWidth] = useState(620);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [highlightCount, setHighlightCount] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const available = entries[0]?.contentRect.width ?? 620;
      setWidth(Math.max(220, available - 24));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  

  const evidencePreview = useMemo(() => evidence?.trim() ?? "", [evidence]);
  const normalizedEvidence = useMemo(() => normalize(evidencePreview), [evidencePreview]);

  // PDF.js splits page text into fragments. Highlight only sufficiently long
  // fragments that appear in the retrieved passage, rather than guessing.
  const renderText = useCallback(({ str }: { str: string }) => {
    const normalizedFragment = normalize(str);
    const isMatch = normalizedEvidence.length > 0 &&
      normalizedFragment.length >= 18 &&
      normalizedEvidence.includes(normalizedFragment);
    return isMatch
      ? `<mark style="background:#fef08a;color:#172c20;border-radius:2px">${escapeHtml(str)}</mark>`
      : escapeHtml(str);
  }, [normalizedEvidence]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0b1b14]/55 lg:bg-transparent" role="dialog" aria-modal="true" aria-label={`Evidence in ${filename}`}>
      <button type="button" aria-label="Close PDF viewer" onClick={onClose} className="absolute inset-0 w-full cursor-default bg-transparent lg:bg-[#0b1b14]/25" />
      <section className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#d7e3d7] bg-[#f7f8f5] shadow-2xl lg:w-[56%]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-stone-200 bg-white px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">PDF evidence viewer</div>
            <h2 className="mt-1 truncate text-base font-semibold" title={filename}>{filename}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-stone-200 px-3 py-2 text-sm hover:bg-stone-100" aria-label="Close viewer">Close Ã—</button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">â†</button>
            <span>Page {page}{pages > 0 ? ` of ${pages}` : ""}</span>
            <button type="button" disabled={pages === 0 || page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">â†’</button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setZoom(z => Math.max(0.65, +(z - 0.15).toFixed(2)))} className="rounded-lg border px-3 py-1.5 text-sm">âˆ’</button>
            <span className="text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(z => Math.min(1.8, +(z + 0.15).toFixed(2)))} className="rounded-lg border px-3 py-1.5 text-sm">+</button>
            <a href={`${url}#page=${page}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs font-semibold text-emerald-800 underline">Open original â†—</a>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-5" ref={containerRef}>
          <div className="mx-auto w-fit max-w-full bg-white shadow-lg">
            <Document
              file={url}
              loading={<p className="p-8 text-sm text-stone-500">Loading PDFâ€¦</p>}
              error={<p className="p-8 text-sm text-rose-700">Unable to display this PDF. Try opening the original.</p>}
              onLoadSuccess={({ numPages }) => { setPages(numPages); setPage(p => Math.min(Math.max(p, 1), numPages)); setError(""); }}
              onLoadError={(err) => setError(err.message)}
            >
              <Page
                pageNumber={page}
                width={Math.round(width * zoom)}
                renderTextLayer
                renderAnnotationLayer
                customTextRenderer={renderText}
                onRenderTextLayerSuccess={() => {
                  // React-PDF text rendering is best-effort: PDF text items can be fragmented.
                  setHighlightCount(document.querySelectorAll('.recall-evidence-page mark').length);
                }}
                className="recall-evidence-page"
              />
            </Document>
          </div>
          {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
        </div>

        <footer className="max-h-[34vh] shrink-0 overflow-auto border-t border-stone-200 bg-white px-4 py-4 sm:px-6">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">Retrieved evidence</div>
          {evidencePreview ? (
            <>
              <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-stone-700">{evidencePreview}</p>
              <p className="mt-2 text-[11px] text-stone-500">{highlightCount > 0 ? "Yellow marks indicate matching text fragments on this page." : "No exact text-layer fragments highlighted. The excerpt above is the retrieved source text; PDF formatting may split it differently."}</p>
            </>
          ) : (
            <p className="mt-2 text-xs text-stone-500">This citation was saved before evidence excerpts were added. The viewer has opened the cited page.</p>
          )}
        </footer>
      </section>
    </div>
  );
}
