"use client";

import Image from "next/image";
import { FormEvent, useMemo, useRef, useState } from "react";
import { getLocationImage } from "@/lib/locationImage";
import { getLocationName } from "@/lib/locationName";

type SearchRecord = Record<string, unknown>;
type PreviewItem = { kind: "pair" | "single"; record: SearchRecord; parts: SearchRecord[] };
type GeneratePayload = {
  pairs?: unknown;
  cards?: unknown;
  matched_locations?: unknown;
  restaurants?: unknown;
  activities?: unknown;
  error?: unknown;
  user_message?: unknown;
};

const defaultPrompt = "Italian dinner and comedy show in Manhattan";
const restrictedNotice = "TheOutHaven is currently in prelaunch. Full planning tools will be available at launch.";

function asRecord(value: unknown): SearchRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as SearchRecord) : null;
}
function asRecords(value: unknown): SearchRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is SearchRecord => Boolean(item)) : [];
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function numberText(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : text(value);
}
function label(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
function firstText(record: SearchRecord, keys: string[]): string | null {
  for (const key of keys) {
    const found = text(record[key]);
    if (found) return found;
  }
  return null;
}
function locationLabel(record: SearchRecord): string | null {
  return firstText(record, ["neighborhood", "borough", "city", "area", "address"]);
}
function categoryLabel(record: SearchRecord): string | null {
  return label(firstText(record, ["display_category", "primary_category", "category", "cuisine", "activity_type", "location_type", "type"]));
}
function ratingLabel(record: SearchRecord): string | null {
  const rating = numberText(record.rating ?? record.google_rating ?? record.average_rating);
  return rating ? `${rating} rating` : null;
}
function distanceLabel(record: SearchRecord): string | null {
  return firstText(record, ["walking_time", "walkingTime", "walk_time_label", "walking_distance", "distance_label", "distance"]);
}
function explanation(record: SearchRecord): string | null {
  return firstText(record, ["explanation", "match_explanation", "recommendation", "reason", "why", "summary"]);
}
function pairParts(pair: SearchRecord): SearchRecord[] {
  return [pair.restaurant, pair.activity, pair.primary, pair.secondary, pair.first, pair.second, pair.location_a, pair.location_b]
    .map(asRecord)
    .filter((item): item is SearchRecord => Boolean(item))
    .slice(0, 2);
}
function singleCandidates(data: GeneratePayload): SearchRecord[] {
  const seen = new Set<string>();
  const sources = [data.cards, data.matched_locations, data.restaurants, data.activities];
  return sources.flatMap(asRecords).filter((record) => {
    const key = firstText(record, ["id", "location_id", "source_id", "name", "restaurant_name", "activity_name", "title"]) ?? JSON.stringify(record).slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}
function buildPreview(data: GeneratePayload): PreviewItem[] {
  const pairs = asRecords(data.pairs).map((pair) => ({ kind: "pair" as const, record: pair, parts: pairParts(pair) })).filter((item) => item.parts.length > 0).slice(0, 2);
  if (pairs.length) return pairs;
  return singleCandidates(data).map((record) => ({ kind: "single" as const, record, parts: [record] }));
}
function imageFor(record: SearchRecord): string | null {
  return getLocationImage(record);
}

export default function PrelaunchSearchPreview() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [status, setStatus] = useState<"idle" | "loading" | "results" | "empty" | "error">("idle");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const statusMessage = useMemo(() => {
    if (status === "loading") return "Finding matches…";
    if (status === "results") return "Preview matches are ready.";
    if (status === "empty") return "No preview matches found.";
    return "";
  }, [status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = prompt.trim();
    if (!input || status === "loading") return;
    setStatus("loading");
    setError(null);
    setItems([]);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, query: input, message: input, prompt: input, usedCustomPrompt: true, source: "homepage_prelaunch_preview" }),
      });
      const data = (await response.json().catch(() => ({}))) as GeneratePayload;
      if (!response.ok || data.error) throw new Error(text(data.user_message) ?? "Search failed");
      const preview = buildPreview(data);
      setItems(preview);
      setStatus(preview.length ? "results" : "empty");
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } catch {
      setStatus("error");
      setError("We couldn’t load preview matches right now. Please try another neighborhood, cuisine, or activity.");
    }
  }

  return <section id="homepage-preview" className="mt-8" aria-labelledby="homepage-preview-title">
    <h2 id="homepage-preview-title" className="sr-only">Try TheOutHaven search preview</h2>
    <form onSubmit={submit} className="rounded-[1.5rem] border border-white/10 bg-white/[.045] p-3 sm:flex sm:items-center sm:gap-3">
      <label className="sr-only" htmlFor="outing-prompt">Outing prompt</label>
      <input id="outing-prompt" name="q" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-12 w-full rounded-full border border-white/10 bg-black/40 px-5 text-base text-white outline-none focus:border-[#e1062a]" />
      <button disabled={status === "loading"} className="mt-3 inline-flex min-h-12 w-full min-w-[9.5rem] items-center justify-center rounded-full bg-white px-7 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-65 sm:mt-0 sm:w-auto whitespace-nowrap">{status === "loading" ? "Finding matches…" : "Try it"}</button>
    </form>
    <p className="mt-3 text-sm leading-6 text-white/58">Type a neighborhood, cuisine, activity, or full outing idea to see a limited read-only preview.</p>
    <div aria-live="polite" className="sr-only">{statusMessage}</div>
    <div ref={resultsRef} className="mt-5">
      {status === "loading" ? <SkeletonCards /> : null}
      {status === "error" ? <p role="alert" className="rounded-2xl border border-red-300/20 bg-red-950/30 p-4 text-sm font-bold text-red-100">{error}</p> : null}
      {status === "empty" ? <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm font-bold text-white/70">No preview matches yet. Try another neighborhood, cuisine, or activity.</p> : null}
      {status === "results" ? <div><p className="mb-4 rounded-2xl border border-[#e1062a]/25 bg-[#e1062a]/10 p-4 text-sm font-bold leading-6 text-red-50">{restrictedNotice}</p><div className="grid gap-4 md:grid-cols-2">{items.map((item, index) => <PreviewCard key={index} item={item} />)}</div></div> : null}
    </div>
  </section>;
}

function SkeletonCards() { return <div className="grid gap-4 md:grid-cols-2" data-testid="preview-skeletons">{[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[.06]" />)}</div>; }
function PreviewCard({ item }: { item: PreviewItem }) {
  const title = item.kind === "pair" ? firstText(item.record, ["title", "pair_title"]) ?? item.parts.map((part) => getLocationName(part, "Recommended stop")).join(" + ") : getLocationName(item.record, "Recommended place");
  const image = imageFor(item.parts[0] ?? item.record);
  const meta = [distanceLabel(item.record), explanation(item.record)].filter(Boolean);
  return <article className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/35" data-testid={item.kind === "pair" ? "prelaunch-pair-card" : "prelaunch-single-card"}>
    {image ? <Image src={image} alt={`${title} preview`} width={640} height={320} unoptimized className="h-40 w-full object-cover" /> : null}
    <div className="p-5"><p className="text-xs font-black uppercase tracking-[.18em] text-[#ff8a9b]">{item.kind === "pair" ? "Paired outing preview" : "Location preview"}</p><h3 className="mt-2 text-xl font-black">{title}</h3>
      <div className="mt-4 space-y-3">{item.parts.map((part, index) => <div key={index} className="rounded-2xl bg-white/[.055] p-3"><p className="font-black">{getLocationName(part, "Recommended stop")}</p><p className="mt-1 text-sm text-white/58">{[categoryLabel(part), locationLabel(part), ratingLabel(part)].filter(Boolean).join(" · ")}</p></div>)}</div>
      {meta.map((line) => <p key={line} className="mt-3 text-sm leading-6 text-white/62">{line}</p>)}
    </div>
  </article>;
}
