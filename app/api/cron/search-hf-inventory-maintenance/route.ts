import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchHuggingFaceEmbeddings, resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(config?.token && provided === `Bearer ${config.token}`);
}

function clean(values: unknown[]) {
  return values.flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String).map((value) => value.trim()).filter(Boolean);
}

function eventDocument(row: any) {
  return clean([
    `Event: ${row.title ?? ""}`,
    row.description,
    row.category ? `Category: ${row.category}` : null,
    row.subcategory ? `Subcategory: ${row.subcategory}` : null,
    row.venue_name ? `Venue: ${row.venue_name}` : null,
    [row.borough, row.city, row.state].filter(Boolean).length ? `Area: ${[row.borough, row.city, row.state].filter(Boolean).join(", ")}` : null,
  ]).join("\n").slice(0, 6000);
}

function experienceDocument(row: any) {
  return clean([
    `Experience: ${row.title ?? ""}`,
    row.description,
    row.category ? `Category: ${row.category}` : null,
    row.experience_type ? `Type: ${row.experience_type}` : null,
    row.venue_name ? `Venue: ${row.venue_name}` : null,
    [row.city, row.state].filter(Boolean).length ? `Area: ${[row.city, row.state].filter(Boolean).join(", ")}` : null,
    row.duration_minutes ? `Duration: ${row.duration_minutes} minutes` : null,
    row.price_per_person != null ? `Price per person: ${row.price_per_person} ${row.currency ?? "USD"}` : null,
    row.min_party_size || row.max_party_size ? `Party size: ${row.min_party_size ?? 1}-${row.max_party_size ?? "any"}` : null,
  ]).join("\n").slice(0, 6000);
}

function documentHash(kind: string, text: string) {
  return createHash("sha256").update(`inventory-semantic-v1\n${kind}\n${text}`).digest("hex");
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const config = await resolveSearchMlRuntimeConfig();
  if (config.semanticMode === "disabled") return NextResponse.json({ ok: true, skipped: true, reason: "semantic_disabled" });

  const batchSize = Math.max(10, Math.min(100, Number(process.env.SEARCH_HF_INVENTORY_BATCH_SIZE || 50)));
  const now = new Date();
  const recent = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
  const [eventResult, experienceResult] = await Promise.all([
    supabaseAdmin.from("events")
      .select("id,location_id,title,description,category,subcategory,venue_name,city,state,market,borough,starts_at,ends_at,status,searchable,updated_at")
      .eq("searchable", true)
      .in("status", ["scheduled", "postponed"])
      .gte("starts_at", recent)
      .order("updated_at", { ascending: false })
      .limit(batchSize),
    supabaseAdmin.from("experiences")
      .select("id,location_id,title,description,category,experience_type,venue_name,city,state,duration_minutes,min_party_size,max_party_size,price_per_person,currency,status,searchable,updated_at")
      .eq("searchable", true)
      .in("status", ["published", "active", "scheduled"])
      .order("updated_at", { ascending: false })
      .limit(batchSize),
  ]);
  if (eventResult.error) return NextResponse.json({ ok: false, error: `events:${eventResult.error.message}` }, { status: 500 });
  if (experienceResult.error) return NextResponse.json({ ok: false, error: `experiences:${experienceResult.error.message}` }, { status: 500 });

  const candidates = [
    ...(eventResult.data ?? []).map((row: any) => ({ sourceKind: "event" as const, sourceId: row.id, locationId: row.location_id, marketKey: row.market, city: row.city, borough: row.borough, state: row.state, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status, searchable: row.searchable, text: eventDocument(row) })),
    ...(experienceResult.data ?? []).map((row: any) => ({ sourceKind: "experience" as const, sourceId: row.id, locationId: row.location_id, marketKey: null, city: row.city, borough: null, state: row.state, startsAt: null, endsAt: null, status: row.status, searchable: row.searchable, text: experienceDocument(row) })),
  ].filter((item) => item.text);

  if (!candidates.length) return NextResponse.json({ ok: true, scanned: 0, updated: 0, unchanged: 0, failed: 0 });

  const eventIds = candidates.filter((item) => item.sourceKind === "event").map((item) => item.sourceId);
  const experienceIds = candidates.filter((item) => item.sourceKind === "experience").map((item) => item.sourceId);
  const existing: any[] = [];
  if (eventIds.length) {
    const { data } = await supabaseAdmin.from("search_inventory_embeddings_hf").select("source_kind,source_id,document_hash,embedding_version").eq("source_kind", "event").in("source_id", eventIds);
    existing.push(...(data ?? []));
  }
  if (experienceIds.length) {
    const { data } = await supabaseAdmin.from("search_inventory_embeddings_hf").select("source_kind,source_id,document_hash,embedding_version").eq("source_kind", "experience").in("source_id", experienceIds);
    existing.push(...(data ?? []));
  }
  const existingByKey = new Map(existing.map((row) => [`${row.source_kind}:${row.source_id}`, row]));
  const prepared = candidates.map((item) => ({ ...item, hash: documentHash(item.sourceKind, item.text) }))
    .filter((item) => {
      const prior = existingByKey.get(`${item.sourceKind}:${item.sourceId}`);
      return !prior || prior.document_hash !== item.hash || prior.embedding_version !== config.embeddingVersion;
    });

  let updated = 0;
  let failed = 0;
  if (prepared.length) {
    try {
      const vectors = await fetchHuggingFaceEmbeddings(prepared.map((item) => item.text), { timeoutMs: 20_000 });
      const rows = prepared.map((item, index) => ({
        source_kind: item.sourceKind,
        source_id: item.sourceId,
        location_id: item.locationId,
        market_key: item.marketKey,
        city: item.city,
        borough: item.borough,
        state: item.state,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        status: item.status,
        searchable: item.searchable,
        semantic_document: item.text,
        document_hash: item.hash,
        embedding: vectors[index],
        embedding_model: config.embeddingModel,
        embedding_version: config.embeddingVersion,
        calculated_at: new Date().toISOString(),
        error_message: null,
      }));
      const { error } = await supabaseAdmin.from("search_inventory_embeddings_hf").upsert(rows, { onConflict: "source_kind,source_id" });
      if (error) throw error;
      updated = rows.length;
    } catch {
      failed = prepared.length;
    }
  }

  return NextResponse.json({
    ok: failed === 0,
    degraded: failed > 0,
    model: config.embeddingModel,
    version: config.embeddingVersion,
    scanned: candidates.length,
    updated,
    unchanged: candidates.length - prepared.length,
    failed,
    eventCandidates: eventIds.length,
    experienceCandidates: experienceIds.length,
  }, { status: failed && updated === 0 ? 500 : 200 });
}
