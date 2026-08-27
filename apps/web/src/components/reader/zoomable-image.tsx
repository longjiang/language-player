'use client';

import { useRef, useState } from 'react';

/**
 * Shared zoomable full-size image for reader preview dialogs (image reader
 * and PDF page preview). Click toggles zoom in/out (1× ↔ 2×), Ctrl+wheel
 * (trackpad pinch) zooms continuously, drag pans while zoomed. Extracted
 * from the image reader so the PDF reader's page preview behaves identically.
 */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const movedRef = useRef(0);

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) return; // trackpad pinch / Ctrl+wheel — not a plain scroll
    e.preventDefault();
    setScale((s) => Math.min(4, Math.max(1, Math.round((s + (e.deltaY < 0 ? 0.15 : -0.15)) * 100) / 100)));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
    movedRef.current = 0;
    dragRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    setDragging(scale > 1);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
    const d = dragRef.current;
    if (!d || scale <= 1) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    movedRef.current += Math.abs(dx) + Math.abs(dy);
    setTranslate({ x: d.tx + dx, y: d.ty + dy });
  };

  const onPointerUp = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const onClick = () => {
    if (movedRef.current > 6) return; // it was a drag, not a click
    if (scale > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2);
    }
  };

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{ touchAction: 'none' }}
      onWheel={onWheel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`max-h-full max-w-full select-none ${scale > 1 ? 'cursor-move' : 'cursor-zoom-in'}`}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: dragging ? 'none' : 'transform 150ms ease-out',
        }}
      />
    </div>
  );
}
