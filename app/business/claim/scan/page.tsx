"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
    };
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function parseClaimCode(value: string) {
  try {
    const url = new URL(value);
    return normalizeCode(url.searchParams.get("code") || url.pathname.split("/").pop() || value);
  } catch {
    return normalizeCode(value.replace(/^.*code=/i, ""));
  }
}

export default function ScanClaimCodePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("Ready to scan if your browser supports camera QR scanning.");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function goWithCode(value: string) {
    const code = parseClaimCode(value);
    if (!code) {
      setStatus("Enter your claim code manually.");
      return;
    }
    window.location.href = `/business/claim?code=${encodeURIComponent(code)}`;
  }

  async function startScan() {
    setStatus("Starting camera...");
    if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
      setStatus("Camera QR scanning is not available in this browser. Enter your claim code manually.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanning(true);
      setStatus("Point your camera at the QR code.");
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          if (streamRef.current) requestAnimationFrame(scan);
          return;
        }
        const codes = await detector.detect(videoRef.current).catch(() => []);
        const raw = codes[0]?.rawValue;
        if (raw) {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          goWithCode(raw);
          return;
        }
        if (streamRef.current) requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch {
      setScanning(false);
      setStatus("Camera permission was denied or unavailable. Enter your claim code manually.");
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto max-w-3xl">
          <Link href="/business/claim" className="text-sm font-black text-white/45 transition hover:text-white">← Back to claim options</Link>
          <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Scan QR Code</p>
            <h1 className="mt-4 text-4xl font-black">Scan Your Claim QR</h1>
            <p className="mt-4 text-sm leading-7 text-white/62">Use your device camera if supported, or enter your claim code manually. Camera denial will not block your claim.</p>

            <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black">
              <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
            </div>
            <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm font-bold text-white/62">{status}</p>

            <button type="button" onClick={startScan} disabled={scanning} className="mt-4 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:opacity-60">
              {scanning ? "Scanning..." : "Scan QR Code"}
            </button>

            <form onSubmit={(event) => { event.preventDefault(); goWithCode(manualCode); }} className="mt-6 rounded-[1.5rem] border border-white/10 bg-black p-5">
              <label className="block" htmlFor="manual-claim-code">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Enter your claim code manually</span>
                <input id="manual-claim-code" value={manualCode} onChange={(event) => setManualCode(normalizeCode(event.target.value))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 font-mono text-sm font-black uppercase tracking-[0.14em] text-white outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-white/25 focus:border-[#e1062a]" placeholder="TOH-XXXX-XXXX" />
              </label>
              <button type="submit" className="mt-4 w-full rounded-2xl bg-white px-6 py-4 text-sm font-black text-black transition hover:bg-rose-100">Enter Code</button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
