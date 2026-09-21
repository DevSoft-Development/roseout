"use client";

import { useCallback, useEffect, useState } from "react";

export default function ReserveLobbyDisplaySettings({ locationId }: { locationId: string }) {
  const [displays, setDisplays] = useState<any[]>([]);
  const [displayUrl, setDisplayUrl] = useState("https://reserve.theouthaven.com/display");
  const [label, setLabel] = useState("Lobby TV");
  const [privacyMode, setPrivacyMode] = useState<"initials" | "anonymous">("initials");
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoMediaType, setPromoMediaType] = useState<"image" | "video">("image");
  const [promoMediaUrl, setPromoMediaUrl] = useState("");
  const [promoHeadline, setPromoHeadline] = useState("");
  const [promoBody, setPromoBody] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    const response = await fetch("/api/reserve/displays?locationId=" + encodeURIComponent(locationId), { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNotice(data.error || "Unable to load lobby displays.");
      return;
    }
    setDisplays(data.displays || []);
    setDisplayUrl(data.displayUrl || "https://reserve.theouthaven.com/display");
  }, [locationId]);

  useEffect(() => { void load(); }, [load]);

  async function createDisplay() {
    setBusy("create");
    setNotice("");
    setPairingCode("");
    try {
      const response = await fetch("/api/reserve/displays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          label,
          privacyMode,
          showEstimatedWait: true,
          showReservationTime: true,
          showWaitlistPosition: true,
          readyHoldMinutes: 10,
          promoEnabled,
          promoMediaType,
          promoMediaUrl,
          promoHeadline,
          promoBody,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to create lobby display.");
      setPairingCode(data.pairingCode || "");
      setDisplayUrl(data.displayUrl || displayUrl);
      setNotice("Pairing code created. It expires in 15 minutes.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to create lobby display.");
    } finally {
      setBusy("");
    }
  }

  async function applySettings(displayId: string) {
    setBusy("save:" + displayId);
    setNotice("");
    try {
      const response = await fetch("/api/reserve/displays", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          displayId,
          privacyMode,
          promoEnabled,
          promoMediaType,
          promoMediaUrl,
          promoHeadline,
          promoBody,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update lobby display.");
      setNotice("Lobby display settings updated.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to update lobby display.");
    } finally {
      setBusy("");
    }
  }

  async function revokeDisplay(displayId: string) {
    setBusy(displayId);
    setNotice("");
    try {
      const response = await fetch("/api/reserve/displays", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, displayId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to revoke display.");
      setNotice("Lobby display revoked.");
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to revoke display.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[#0d1015] p-5 sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">Lobby display</p>
          <h3 className="mt-1 text-xl font-black">Reservations + waitlist TV</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">
            Pair a read-only TV. With promotions enabled, the screen is 50/50: Reservations above Waitlist on the left and your advertisement on the right.
          </p>
        </div>
        <a href={displayUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm font-black text-white/75">
          Open TV pairing page
        </a>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-black text-white/55">Screen name
              <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold text-white" />
            </label>
            <label className="text-xs font-black text-white/55">Guest privacy
              <select value={privacyMode} onChange={(e) => setPrivacyMode(e.target.value as "initials" | "anonymous")} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#111318] px-3 text-sm font-bold text-white">
                <option value="initials">First name + last initial</option>
                <option value="anonymous">Anonymous party number</option>
              </select>
            </label>
          </div>

          <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm font-black">
            <span>Show advertisement on right half
              <span className="mt-1 block text-xs font-semibold text-white/40">When off, the queue fills the entire TV.</span>
            </span>
            <input type="checkbox" checked={promoEnabled} onChange={(e) => setPromoEnabled(e.target.checked)} />
          </label>

          {promoEnabled ? (
            <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/15 p-4">
              <label className="block text-xs font-black text-white/55">Media type
                <select value={promoMediaType} onChange={(e) => setPromoMediaType(e.target.value as "image" | "video")} className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-[#111318] px-3 text-sm font-bold text-white">
                  <option value="image">Image</option>
                  <option value="video">Muted looping video</option>
                </select>
              </label>
              <label className="block text-xs font-black text-white/55">Media URL
                <input value={promoMediaUrl} onChange={(e) => setPromoMediaUrl(e.target.value)} placeholder="https://..." className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold text-white" />
              </label>
              <label className="block text-xs font-black text-white/55">Headline
                <input value={promoHeadline} onChange={(e) => setPromoHeadline(e.target.value)} placeholder="Try our weekend brunch" className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm font-bold text-white" />
              </label>
              <label className="block text-xs font-black text-white/55">Supporting text
                <textarea value={promoBody} onChange={(e) => setPromoBody(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm font-bold text-white" />
              </label>
            </div>
          ) : null}

          <button type="button" onClick={() => void createDisplay()} disabled={busy === "create" || !label.trim()} className="mt-4 w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black text-white disabled:opacity-40">
            {busy === "create" ? "Creating…" : "Create pairing code"}
          </button>

          {pairingCode ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-center">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-200">TV pairing code</p>
              <p className="mt-2 text-4xl font-black tracking-[0.35em] text-white">{pairingCode}</p>
              <p className="mt-2 text-xs font-semibold text-white/55">Open the TV pairing page and enter this code.</p>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-sm font-black">Lobby displays</h4>
          {displays.length ? (
            <div className="mt-3 space-y-3">
              {displays.map((display) => (
                <div key={display.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{display.label || "Lobby TV"}</p>
                      <p className="mt-1 text-xs text-white/40">
                        {display.status === "active" ? "Active" : "Revoked"} · {display.paired_at ? "Paired" : "Waiting for pairing"} · {display.promo_enabled ? "50/50 ad layout" : "Queue only"}
                      </p>
                    </div>
                    {display.status === "active" ? (
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => void applySettings(display.id)} disabled={busy === "save:" + display.id} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white/70">Apply settings</button>
                        <button type="button" onClick={() => void revokeDisplay(display.id)} disabled={busy === display.id} className="rounded-full border border-[#e1062a]/30 px-3 py-2 text-xs font-black text-[#ff8aa0]">Revoke</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm font-semibold text-white/40">No lobby displays configured yet.</p>}
        </div>
      </div>

      {notice ? <p className="mt-4 text-sm font-bold text-white/70">{notice}</p> : null}
    </section>
  );
}
