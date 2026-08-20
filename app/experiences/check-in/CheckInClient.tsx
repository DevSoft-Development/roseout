"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

function credentialFromScan(value: string) {
  const match = value.match(/\/experience-bookings\/([A-Za-z0-9_-]{24,80})/);
  return match?.[1] || value.trim();
}

export default function CheckInClient() {
  const scanner = useRef<Html5Qrcode | null>(null);
  const processing = useRef(false);
  const [code, setCode] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function checkIn(credential: string) {
    if (!credential || processing.current) return;
    processing.current = true;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/experiences/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialFromScan(credential), guestCount }),
      });
      const payload = await response.json().catch(() => ({ error: "Check-in failed." }));
      setResult({ ...payload, httpOk: response.ok });
    } finally {
      setBusy(false);
      window.setTimeout(() => { processing.current = false; }, 1600);
    }
  }

  useEffect(() => {
    const instance = new Html5Qrcode("experience-reader");
    scanner.current = instance;
    instance.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (text) => { void checkIn(text); },
      () => {},
    ).catch(() => {});
    return () => {
      instance.stop().catch(() => {});
      scanner.current = null;
    };
  }, []);

  return <div className="space-y-5">
    <div id="experience-reader" className="overflow-hidden rounded-3xl border border-white/10 bg-black" />
    <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={80} placeholder="Backup code or QR token" className="rounded-xl border border-white/10 bg-black/30 p-3" />
      <input value={guestCount} onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value || 1)))} type="number" min="1" className="rounded-xl border border-white/10 bg-black/30 p-3" />
      <button onClick={() => checkIn(code)} disabled={busy || !code} className="rounded-xl bg-[#e1062a] px-5 py-3 font-black disabled:opacity-50">Check in</button>
    </div>
    {result ? <div className={`rounded-2xl border p-5 ${result.httpOk ? "border-emerald-400/30 bg-emerald-400/10" : "border-red-400/30 bg-red-400/10"}`}><p className="font-black">{result.httpOk ? "Check-in accepted" : "Check-in not accepted"}</p><p className="mt-1 text-sm">{result.customerName || result.error}</p>{result.partySize ? <p className="mt-2 text-sm">{result.checkedInCount}/{result.partySize} guests checked in · {result.remainingGuests ?? 0} remaining</p> : null}</div> : null}
  </div>;
}
