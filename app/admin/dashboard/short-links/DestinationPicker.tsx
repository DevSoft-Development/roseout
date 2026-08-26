"use client";

import { CalendarDays, Check, Copy, MapPin, Search, Sparkles, TicketCheck, Users, QrCode, Megaphone, Route, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Destination = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  destination_url: string;
  entity_type: string;
  entity_id: string;
  campaign_id: string | null;
};

type CreatedLink = { short_url: string; id: string };

type DestinationType = {
  value: string;
  label: string;
  helper: string;
  icon: typeof MapPin;
};

const TYPES: DestinationType[] = [
  { value: "location", label: "Location", helper: "Public business page", icon: MapPin },
  { value: "claim", label: "Claim", helper: "Business claim flow", icon: Users },
  { value: "event", label: "Event", helper: "Published event", icon: CalendarDays },
  { value: "experience", label: "Experience", helper: "Published experience", icon: Sparkles },
  { value: "reservation", label: "Reservation", helper: "Location booking page", icon: TicketCheck },
  { value: "postcard", label: "Postcard", helper: "Tracked postcard claim", icon: QrCode },
  { value: "outing", label: "Outing", helper: "Saved outing plan", icon: Route },
  { value: "campaign", label: "Campaign", helper: "Campaign public page", icon: Megaphone },
];

export default function DestinationPicker() {
  const [type, setType] = useState("location");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/short-links/destinations?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load destinations.");
      setResults(payload.destinations || []);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Unable to load destinations.");
    } finally {
      setLoading(false);
    }
  }, [search, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(destination: Destination) {
    setCreatingId(destination.id);
    setError(null);
    setCreated(null);
    try {
      const response = await fetch("/api/admin/short-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: destination.title,
          destination_url: destination.destination_url,
          link_type: destination.type,
          entity_type: destination.entity_type,
          entity_id: destination.entity_id,
          campaign_id: destination.campaign_id,
          metadata: {
            selected_from_destination_picker: true,
            destination_type: destination.type,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to create short link.");
      setCreated({ id: payload.link.id, short_url: payload.link.short_url });
      window.dispatchEvent(new CustomEvent("short-links:created", { detail: payload.link }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create short link.");
    } finally {
      setCreatingId(null);
    }
  }

  async function copyCreated() {
    if (!created) return;
    await navigator.clipboard.writeText(created.short_url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-[1.35rem] border border-rose-300/15 bg-[radial-gradient(circle_at_top_right,rgba(236,11,91,0.12),transparent_36%),rgba(255,255,255,0.025)] p-4 shadow-xl shadow-black/15 sm:p-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Fast create</p>
        <h3 className="mt-1 text-xl font-black text-white">Choose a destination</h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/45">Pick a real TheOutHaven record and press Create link. The system builds the destination, short code, link type, and tracking metadata automatically.</p>
      </div>

      {created ? (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Link created</p><p className="mt-1 truncate text-lg font-black text-white">{created.short_url}</p></div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => void copyCreated()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-white">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</button>
            <a href={created.short_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-3 text-xs font-black text-white"><ExternalLink className="h-4 w-4" /> Open</a>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {TYPES.map((item) => {
          const Icon = item.icon;
          const active = item.value === type;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => { setType(item.value); setSearch(""); setCreated(null); }}
              className={`min-w-0 rounded-2xl border p-3 text-left transition ${active ? "border-rose-300/45 bg-rose-500/10 shadow-lg shadow-rose-950/10" : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]"}`}
            >
              <span className={`inline-flex rounded-xl p-2 ${active ? "bg-[#ec0b5b] text-white" : "bg-white/[0.06] text-white/55"}`}><Icon className="h-4 w-4" /></span>
              <span className="mt-2 block truncate text-xs font-black text-white">{item.label}</span>
              <span className="mt-0.5 block truncate text-[10px] font-semibold text-white/35">{item.helper}</span>
            </button>
          );
        })}
      </div>

      <label className="admin-field mt-4 flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-white focus-within:border-rose-300/50 focus-within:ring-4 focus-within:ring-rose-300/10">
        <Search className="h-4 w-4 shrink-0 text-white/35" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${TYPES.find((item) => item.value === type)?.label.toLowerCase() || "destinations"}...`} className="min-w-0 flex-1 bg-transparent py-2 text-sm font-semibold outline-none placeholder:text-white/30" />
        {loading ? <RefreshCw className="h-4 w-4 animate-spin text-rose-200" /> : null}
      </label>

      {error ? <div className="mt-3 rounded-xl border border-rose-300/20 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-100">{error}</div> : null}

      <div className="mt-3 max-h-[360px] space-y-2 overflow-y-auto pr-1">
        {!loading && !results.length ? <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm font-semibold text-white/40">No matching destinations found.</div> : null}
        {results.map((destination) => (
          <article key={`${destination.type}-${destination.id}`} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-white/10 bg-black/15 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-white">{destination.title}</p>
              {destination.subtitle ? <p className="mt-0.5 truncate text-xs font-semibold text-white/40">{destination.subtitle}</p> : null}
              <p className="mt-1 truncate text-[11px] text-white/30">{destination.destination_url}</p>
            </div>
            <button type="button" disabled={creatingId === destination.id} onClick={() => void create(destination)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-3 text-xs font-black text-white shadow-md shadow-rose-950/20 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
              {creatingId === destination.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Create link
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
