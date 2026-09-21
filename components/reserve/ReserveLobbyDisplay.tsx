"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type QueuePayload = {
  success: boolean;
  paired?: boolean;
  generatedAt?: string;
  error?: string;
  location?: { name?: string };
  display?: {
    label?: string;
    privacyMode?: string;
    promo?: {
      enabled?: boolean;
      mediaType?: "image" | "video";
      mediaUrl?: string | null;
      headline?: string | null;
      body?: string | null;
      linkLabel?: string | null;
      linkUrl?: string | null;
    };
  };
  reservations?: Array<{
    id: string;
    label: string;
    partySize: number;
    time?: string | null;
    state: string;
    ready?: boolean;
  }>;
  waitlist?: Array<{
    id: string;
    label: string;
    partySize: number;
    position?: number | null;
    estimatedWait?: number | null;
    state: string;
    ready?: boolean;
  }>;
};

export default function ReserveLobbyDisplay() {
  const [payload, setPayload] = useState<QueuePayload | null>(null);
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [message, setMessage] = useState("");
  const [lastGoodAt, setLastGoodAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/public/display/queue", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      setPayload(data);
      if (response.ok && data.success) setLastGoodAt(Date.now());
    } catch {
      setPayload((current) => current || { success: false, error: "Unable to reach Reserve." });
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  async function pair() {
    if (!/^\d{6}$/.test(code)) return;
    setPairing(true);
    setMessage("");
    try {
      const response = await fetch("/api/public/display/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to pair display.");
      setCode("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to pair display.");
    } finally {
      setPairing(false);
    }
  }

  const offline = useMemo(
    () => Boolean(lastGoodAt && Date.now() - lastGoodAt > 20_000),
    [lastGoodAt, payload?.generatedAt],
  );

  if (!payload?.paired) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#050607] p-6 text-white">
        <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-[#0b0d11] p-8 text-center shadow-2xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff6b86]">TheOutHaven Reserve</p>
          <h1 className="mt-3 text-4xl font-black">Pair lobby display</h1>
          <p className="mt-3 text-base font-semibold leading-7 text-white/50">
            Create a 6-digit pairing code from Reservation Settings → Team Access, then enter it here.
          </p>
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(event) => event.key === "Enter" && void pair()}
            className="mt-7 w-full rounded-2xl border border-white/15 bg-black/30 px-5 py-5 text-center text-4xl font-black tracking-[0.45em] outline-none focus:border-[#e1062a]/70"
            placeholder="000000"
          />
          <button
            type="button"
            onClick={() => void pair()}
            disabled={pairing || !/^\d{6}$/.test(code)}
            className="mt-4 w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-base font-black disabled:opacity-40"
          >
            {pairing ? "Pairing…" : "Pair display"}
          </button>
          {message || payload?.error ? (
            <p className="mt-4 text-sm font-bold text-[#ff8aa0]">{message || payload?.error}</p>
          ) : null}
        </div>
      </main>
    );
  }

  const reservations = payload.reservations || [];
  const waitlist = payload.waitlist || [];
  const promo = payload.display?.promo;
  const split = Boolean(promo?.enabled);
  const name = payload.location?.name || "TheOutHaven Reserve";

  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-6 border-b border-white/10 bg-[#080a0e] px-8 py-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">TheOutHaven Reserve</p>
            <h1 className="mt-1 text-3xl font-black tracking-[-0.03em]">{name}</h1>
          </div>
          <div className="text-right">
            <p className="text-sm font-black">Live queue</p>
            <p className="mt-1 text-xs font-semibold text-white/40">
              {offline ? "Reconnecting…" : "Updates automatically"}
            </p>
          </div>
        </header>

        <div className={`grid min-h-0 flex-1 ${split ? "grid-cols-2" : "grid-cols-1"}`}>
          <section className="min-h-0 overflow-hidden p-6">
            <div className="grid h-full min-h-0 grid-rows-2 gap-5">
              <QueueColumn
                title="Reservations"
                empty="No checked-in reservations right now."
                rows={reservations.map((row) => ({
                  id: row.id,
                  label: row.label,
                  meta: `Party of ${row.partySize}${row.time ? ` · ${row.time}` : ""}`,
                  state: row.state,
                  ready: row.ready,
                }))}
              />
              <QueueColumn
                title="Waitlist"
                empty="No one is currently waiting."
                rows={waitlist.map((row) => ({
                  id: row.id,
                  label: row.label,
                  meta: [
                    row.position ? `#${row.position}` : null,
                    `Party of ${row.partySize}`,
                    row.estimatedWait != null ? `${row.estimatedWait} min` : null,
                  ].filter(Boolean).join(" · "),
                  state: row.state,
                  ready: row.ready,
                }))}
              />
            </div>
          </section>

          {split ? (
            <aside className="min-h-0 border-l border-white/10 bg-[#0b0d11] p-6">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#10131a] shadow-2xl">
                <div className="min-h-0 flex-1 overflow-hidden bg-black">
                  {promo?.mediaUrl ? (
                    promo.mediaType === "video" ? (
                      <video
                        src={promo.mediaUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        role="img"
                        aria-label="Location promotion"
                        className="h-full w-full bg-cover bg-center bg-no-repeat"
                        style={{ backgroundImage: `url("${promo.mediaUrl.replace(/"/g, "%22")}")` }}
                      />
                    )
                  ) : (
                    <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.2),transparent_45%)] p-10 text-center">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Featured</p>
                        <p className="mt-3 text-3xl font-black">Your promotion here</p>
                      </div>
                    </div>
                  )}
                </div>
                {(promo?.headline || promo?.body || promo?.linkLabel) ? (
                  <div className="shrink-0 p-6">
                    {promo?.headline ? <h2 className="text-3xl font-black tracking-[-0.03em]">{promo.headline}</h2> : null}
                    {promo?.body ? <p className="mt-3 text-base font-semibold leading-7 text-white/60">{promo.body}</p> : null}
                    {promo?.linkLabel ? (
                      <p className="mt-4 text-sm font-black uppercase tracking-[0.12em] text-[#ff8aa0]">
                        {promo.linkLabel}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>

        <footer className="border-t border-white/10 bg-[#080a0e] px-8 py-4 text-center text-sm font-black text-white/60">
          Please see the host when your party shows READY.
        </footer>
      </div>
    </main>
  );
}

function QueueColumn({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: Array<{ id: string; label: string; meta: string; state: string; ready?: boolean }>;
  empty: string;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0d11]">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-2xl font-black">{title}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4">
        {rows.length ? (
          <div className="space-y-3">
            {rows.slice(0, 10).map((row) => (
              <div
                key={row.id}
                className={`rounded-2xl border px-5 py-4 ${row.ready ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-white/[0.035]"}`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-2xl font-black">{row.label}</p>
                    <p className="mt-1 text-sm font-bold text-white/45">{row.meta}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-4 py-2 text-sm font-black uppercase tracking-[0.08em] ${row.ready ? "bg-emerald-400 text-black" : "border border-white/10 bg-white/[0.05] text-white/70"}`}>
                    {row.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <p className="text-lg font-bold text-white/35">{empty}</p>
          </div>
        )}
      </div>
    </div>
  );
}
