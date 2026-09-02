import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { TextLayer, RenderingCancelledException } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annotation, Rect } from '../../lib/types';

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
  annotations: Annotation[];
  selectedId: string | null;
  searchRects: Rect[];
  flash: Rect | null;
  onMarkerClick: (id: string) => void;
}

const pct = (n: number) => `${n * 100}%`;

function rectStyle(r: Rect): CSSProperties {
  return { left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) };
}

export const PdfPage = memo(function PdfPage({ pdf, pageNumber, width, height, scale, visible, annotations, selectedId, searchRects, flash, onMarkerClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textDiv = textRef.current;
    if (!canvas || !textDiv) return;
    if (!visible) {
      if (renderedRef.current) {
        canvas.width = 0;
        canvas.height = 0;
        textDiv.replaceChildren();
        renderedRef.current = false;
      }
      return;
    }
    let cancelled = false;
    let renderTask: { cancel(): void } | null = null;
    let textLayer: TextLayer | null = null;

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
        renderTask = task;
        const textPromise = page.getTextContent();
        await task.promise;
        if (cancelled) return;
        renderedRef.current = true;
        const textContent = await textPromise;
        if (cancelled) return;
        textDiv.replaceChildren();
        textLayer = new TextLayer({ textContentSource: textContent, container: textDiv, viewport });
        await textLayer.render();
        if (cancelled) return;
        const end = document.createElement('div');
        end.className = 'endOfContent';
        textDiv.append(end);
      } catch (e) {
        if (!(e instanceof RenderingCancelledException)) console.error(e);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, pageNumber, scale, visible]);

  const style: CSSProperties & Record<string, string | number> = {
    width,
    height,
    '--scale-factor': scale,
    '--total-scale-factor': scale,
    '--user-unit': 1,
  };

  return (
    <div className="pdf-page" data-page={pageNumber} style={style}>
      <canvas ref={canvasRef} className="pdf-canvas" />
      <div className="hl-layer" aria-hidden>
        {annotations.map((a) =>
          a.rects.map((r, i) => <div key={a.id + i} className={`hl hl-${a.kind} ${a.id === selectedId ? 'is-selected' : ''}`} style={rectStyle(r)} />),
        )}
        {searchRects.map((r, i) => (
          <div key={'s' + i} className="hl hl-search" style={rectStyle(r)} />
        ))}
        {flash && <div key={`${flash.x}-${flash.y}`} className="hl-flash" style={rectStyle(flash)} />}
      </div>
      <div ref={textRef} className="textLayer" />
      <div className="marker-layer">
        {annotations.map((a) => {
          const top = Math.min(...a.rects.map((r) => r.y));
          return (
            <button
              key={a.id}
              type="button"
              className={`marker marker-${a.kind} ${a.id === selectedId ? 'is-selected' : ''} ${a.severity === 'major' ? 'is-major' : ''}`}
              style={{ top: pct(top) }}
              title={a.comment || a.quote.slice(0, 120)}
              onClick={(e) => {
                e.stopPropagation();
                onMarkerClick(a.id);
              }}
              aria-label={`${a.kind} note`}
            />
          );
        })}
      </div>
      {!visible && <div className="pdf-page-placeholder">{pageNumber}</div>}
    </div>
  );
});
