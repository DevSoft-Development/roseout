"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Display-only signature input. Never interprets strokes as payment approval.
 * Parent must verify the location/check/tender and payment status on the SERVER
 * before storing the Blob in encrypted, private evidence storage.
 */
export function CustomerSignaturePad({
  onCapture,
  disabled = false,
}: {
  onCapture: (png: Blob) => Promise<void>;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [ink, setInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    drawing.current = false;
    hasInk.current = false;
    setInk(false);
    setError("");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      // Resizing invalidates strokes. Never silently distort a stored signature.
      const width = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(180 * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#171717";
      }
      hasInk.current = false;
      setInk(false);
    };
    resize();
    // Deliberately avoid resizing mid-signature: preserves signature integrity.
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || saving) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
    drawing.current = true;
    hasInk.current = true;
    setInk(true);
    setError("");
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled || saving) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  const capture = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk.current || disabled || saving) return;
    setSaving(true);
    setError("");
    try {
      const png = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("signature_export_failed")), "image/png");
      });
      if (png.size > 1024 * 1024) throw new Error("signature_too_large");
      await onCapture(png);
    } catch {
      setError("Signature could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Digital customer signature" className="space-y-3">
      <p className="text-sm font-semibold">Customer signature (only when requested)</p>
      <p className="text-xs text-[var(--business-muted)]">
        Review your total before signing. Signing does not process another payment.
      </p>
      <canvas
        ref={canvasRef}
        aria-label="Draw your signature using your finger or stylus"
        role="img"
        className="h-[180px] w-full rounded-xl border border-[var(--business-border)] bg-white touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      />
      <div className="flex gap-3">
        <button type="button" onClick={clear} disabled={!ink || disabled || saving}
          className="min-h-11 rounded-xl border border-[var(--business-border)] px-5 disabled:opacity-50">Clear</button>
        <button type="button" onClick={capture} disabled={!ink || disabled || saving}
          className="min-h-11 rounded-xl bg-rose-700 px-5 font-semibold text-white disabled:opacity-50">
          {saving ? "Saving..." : "Save signature"}
        </button>
      </div>
      {error ? <p role="alert" className="text-sm text-red-400">{error}</p> : null}
    </section>
  );
}
