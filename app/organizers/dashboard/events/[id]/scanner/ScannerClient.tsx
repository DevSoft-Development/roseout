"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

const READER_ID = "event-ticket-reader";

type ScanResult = {
  ok: boolean;
  result: string;
  message: string;
  attendeeName?: string;
  attendeeEmail?: string;
  checkedInAt?: string | null;
};

export default function ScannerClient({ eventId, eventTitle, organizationId }: { eventId: string; eventTitle: string; organizationId: string }) {
  const scannerRef = useRef<any>(null);
  const processingRef = useRef(false);
  const [status, setStatus] = useState<"starting" | "ready" | "checking" | "success" | "error">("starting");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState("");

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
    } catch {
      // Camera may already be stopped.
    }
  }

  async function startScanner() {
    processingRef.current = false;
    setResult(null);
    setCameraError("");
    setStatus("starting");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      await stopScanner();
      const scanner = new Html5Qrcode(READER_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        async (decodedText) => {
          if (processingRef.current) return;
          processingRef.current = true;
          setStatus("checking");
          try {
            const response = await fetch(`/api/events/${eventId}/check-in`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ token: decodedText }),
            });
            const payload = (await response.json().catch(() => ({}))) as ScanResult;
            setResult(payload);
            setStatus(response.ok && payload.ok ? "success" : "error");
            await stopScanner();
          } catch (error) {
            setResult({ ok: false, result: "network_error", message: error instanceof Error ? error.message : "Check-in failed" });
            setStatus("error");
            await stopScanner();
          }
        },
        () => undefined,
      );
      setStatus("ready");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera could not be started");
      setStatus("error");
    }
  }

  useEffect(() => {
    startScanner();
    return () => {
      void stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  return (
    <main className="min-h-screen bg-[#050607] px-4 pb-10 pt-24 text-white sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#ff2142]">Organizer Scanner</p>
            <h1 className="mt-2 text-3xl font-black">{eventTitle}</h1>
            <p className="mt-2 text-sm text-white/45">Point the camera at an attendee&apos;s TheOutHaven QR ticket. Each valid ticket checks in once.</p>
          </div>
          <Link href={`/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&tab=scanner`} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-white/70">Back to events</Link>
        </div>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[.03] p-4 sm:p-6">
          <div id={READER_ID} className="mx-auto min-h-[320px] max-w-xl overflow-hidden rounded-2xl bg-black" />
          <div className="mt-5 text-center">
            {status === "starting" ? <p className="text-sm font-bold text-white/50">Starting camera…</p> : null}
            {status === "ready" ? <p className="text-sm font-bold text-emerald-300">Camera ready — scan a ticket.</p> : null}
            {status === "checking" ? <p className="text-sm font-bold text-amber-200">Validating ticket…</p> : null}
            {cameraError ? <p className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm font-bold text-red-200">{cameraError}</p> : null}
          </div>
        </section>

        {result ? (
          <section className={`mt-5 rounded-3xl border p-6 text-center ${result.ok ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"}`}>
            {result.ok ? <CheckCircle2 className="mx-auto text-emerald-300" size={42} /> : <XCircle className="mx-auto text-red-300" size={42} />}
            <h2 className="mt-3 text-2xl font-black">{result.ok ? "Checked In" : result.message}</h2>
            {result.attendeeName ? <p className="mt-2 text-lg font-bold">{result.attendeeName}</p> : null}
            {result.attendeeEmail ? <p className="mt-1 text-sm text-white/55">{result.attendeeEmail}</p> : null}
            {result.checkedInAt ? <p className="mt-2 text-xs text-white/45">{new Date(result.checkedInAt).toLocaleString()}</p> : null}
            <button onClick={startScanner} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-black"><RotateCcw size={16} /> Scan next ticket</button>
          </section>
        ) : null}
      </div>
    </main>
  );
}
