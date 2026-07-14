import { normalizeAnchorText, normalizeAliasList } from "./normalize";
import type { AnchorResolution, SearchAnchor } from "./types";

function toAnchor(row: any): SearchAnchor {
  return { ...row, id: row.id, name: row.canonical_name, latitude: Number(row.latitude), longitude: Number(row.longitude), aliases: Array.isArray(row.aliases) ? row.aliases : [], default_radius_miles: Number(row.default_radius_miles ?? 1.5), max_radius_miles: Number(row.max_radius_miles ?? 3) };
}

function similarity(a: string, b: string) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.86;
  const aa = new Set(a.split(" ")); const bb = new Set(b.split(" "));
  return [...aa].filter((x) => bb.has(x)).length / Math.max(aa.size, bb.size);
}

export async function resolveSearchAnchor(supabase: any, rawName: string, areaHint?: string | null): Promise<AnchorResolution> {
  const started = performance.now();
  const normalized = normalizeAnchorText(rawName);
  const base = supabase.from("search_anchors").select("*").eq("is_active", true).eq("is_searchable", true).eq("review_status", "approved");
  const { data } = await base.or(`normalized_name.eq.${normalized},aliases.cs.{"${rawName.replace(/"/g, "")}"}`).limit(20);
  let candidates = Array.isArray(data) ? data.map(toAnchor) : [];
  let source: AnchorResolution["source"] = candidates.some((c) => c.normalized_name === normalized) ? "registry_exact" : candidates.length ? "registry_alias" : "none";
  if (!candidates.length) {
    const token = rawName.replace(/[%_,]/g, " ").trim();
    const { data: fuzzy } = await supabase.from("search_anchors").select("*").eq("is_active", true).eq("is_searchable", true).eq("review_status", "approved").ilike("canonical_name", `%${token}%`).limit(25);
    candidates = (Array.isArray(fuzzy) ? fuzzy : []).map(toAnchor).map((row) => ({ ...row, confidence: Math.max(similarity(row.normalized_name, normalized), ...normalizeAliasList(row.aliases).map((a) => similarity(a, normalized))) })).filter((row) => Number(row.confidence) >= 0.72).sort((a, b) => Number(b.confidence) - Number(a.confidence));
    source = candidates.length ? "registry_fuzzy" : "none";
  }
  if (!candidates.length) return { status: "not_found", anchor: null, candidates: [], source: "none", confidence: null, resolutionMs: Math.round(performance.now() - started) };
  const top = candidates[0];
  const confidence = Number(top.confidence ?? (source === "registry_exact" || source === "registry_alias" ? 1 : 0.82));
  if (candidates.length > 1 && confidence < 0.92 && confidence - Number(candidates[1].confidence ?? 0.8) < 0.08) return { status: "ambiguous", anchor: null, candidates: candidates.slice(0, 5), source, confidence, resolutionMs: Math.round(performance.now() - started) };
  if (!Number.isFinite(Number(top.latitude)) || !Number.isFinite(Number(top.longitude))) return { status: "missing_coordinates", anchor: top, candidates: [top], source, confidence, resolutionMs: Math.round(performance.now() - started) };
  return { status: "resolved", anchor: top, candidates: candidates.slice(0, 5), source, confidence, resolutionMs: Math.round(performance.now() - started) };
}

export async function recordAnchorDiscovery(supabase: any, args: { rawQuery: string; rawAnchorText: string; areaHint?: string | null; requestedDomain: "restaurant" | "activity" }) {
  const normalized = normalizeAnchorText(args.rawAnchorText);
  await supabase.from("search_anchor_discoveries").upsert({ raw_query: args.rawQuery, raw_anchor_text: args.rawAnchorText, normalized_anchor_text: normalized, area_hint: args.areaHint ?? null, requested_domain: args.requestedDomain, last_seen_at: new Date().toISOString() }, { onConflict: "normalized_anchor_text,area_hint,requested_domain" }).select("id").maybeSingle().catch?.(() => null);
}
