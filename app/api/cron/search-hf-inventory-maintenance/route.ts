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

  const url = new URL(request.url);
  const requestedBatch = Number(url.searchParams.get("batch") || process.env.SEARCH_HF_INVENTORY_BATCH_SIZE || 100);
  const batchSize = Math.max(10, Math.min(120, Number.isFinite(requestedBatch) ? requestedBatch : 100));
  const scanLimit = Math.max(batchSize, Math.min(5000, Number(url.searchParams.get("scan") || 5000)));
  const now = new Date();
  const nowIso = now.toISOString();
  const recent = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();

  const [eventResult, experienceResult, existingResult] = await Promise.all([
    supabaseAdmin.from("events")
      .select("id,location_id,title,description,category,subcategory,venue_name,city,state,market,borough,starts_at,ends_at,status,searchable,updated_at")
      .eq("searchable", true)
      .in("status", ["scheduled", "postponed"])
      .or(`starts_at.gte.${recent},ends_at.gte.${nowIso}`)
      .order("updated_at", { ascending: false })
      .limit(scanLimit),
    supabaseAdmin.from("experiences")
      .select("id,location_id,title,description,category,experience_type,venue_name,city,state,duration_minutes,min_party_size,max_party_size,price_per_person,currency,status,searchable,updated_at")
      .eq("searchable", true)
      .in("status", ["published", "active", "scheduled"])
      .order("updated_at", { ascending: false })
      .limit(scanLimit),
    supabaseAdmin.from("search_inventory_embeddings_hf")
      .select("source_kind,source_id,document_hash,embedding_version")
      .limit(10000),
  ]);
  if (eventResult.error) return NextResponse.json({ ok: false, error: `events:${eventResult.error.message}` }, { status: 500 });
  if (experienceResult.error) return NextResponse.json({ ok: false, error: `experiences:${experienceResult.error.message}` }, { status: 500 });
  if (existingResult.error) return NextResponse.json({ ok: false, error: `existing:${existingResult.error.message}` }, { status: 500 });

  const existingByKey = new Map((existingResult.data ?? []).map((row: any) => [`${row.source_kind}:${row.source_id}`, row]));
  const eventCandidates = (eventResult.data ?? []).map((row: any) => ({
    sourceKind: "event" as const,
    sourceId: row.id,
    locationId: row.location_id,
    marketKey: row.market,
    city: row.city,
    borough: row.borough,
    state: row.state,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    searchable: row.searchable,
    text: eventDocument(row),
  }));
  const experienceCandidates = (experienceResult.data ?? []).map((row: any) => ({
    sourceKind: "experience" as const,
    sourceId: row.id,
    locationId: row.location_id,
    marketKey: null,
    city: row.city,
    borough: null,
    state: row.state,
    startsAt: null,
    endsAt: null,
    status: row.status,
    searchable: row.searchable,
    text: experienceDocument(row),
  }));

  const needsEmbedding = (item: any) => {
    if (!item.text) return false;
    const hash = documentHash(item.sourceKind, item.text);
    const prior = existingByKey.get(`${item.sourceKind}:${item.sourceId}`) as any;
    return !prior || prior.document_hash !== hash || prior.embedding_version !== config.embeddingVersion;
  };

  const missingEvents = eventCandidates.filter(needsEmbedding);
  const missingExperiences = experienceCandidates.filter(needsEmbedding);
  const eventQuota = Math.min(missingEvents.length, Math.ceil(batchSize / 2));
  const experienceQuota = Math.min(missingExperiences.length, batchSize - eventQuota);
  const spare = batchSize - eventQuota - experienceQuota;
  const prepared = [
    ...missingEvents.slice(0, eventQuota + Math.max(0, spare && missingExperiences.length <= experienceQuota ? spare : 0)),
    ...missingExperiences.slice(0, experienceQuota + Math.max(0, spare && missingEvents.length <= eventQuota ? spare : 0)),
  ].slice(0, batchSize).map((item) => ({ ...item, hash: documentHash(item.sourceKind, item.text) }));

  if (!prepared.length) {
    return NextResponse.json({
      ok: true,
      scanned: eventCandidates.length + experienceCandidates.length,
      updated: 0,
      unchanged: eventCandidates.length + experienceCandidates.length,
      failed: 0,
      remaining: 0,
      eventCandidates: eventCandidates.length,
      experienceCandidates: experienceCandidates.length,
    });
  }

  let updated = 0;
  let failed = 0;
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

  const remaining = Math.max(0, missingEvents.length + missingExperiences.length - updated);
  return NextResponse.json({
    ok: failed === 0,
    degraded: failed > 0,
    model: config.embeddingModel,
    version: config.embeddingVersion,
    scanned: eventCandidates.length + experienceCandidates.length,
    updated,
    unchanged: eventCandidates.length + experienceCandidates.length - missingEvents.length - missingExperiences.length,
    failed,
    remaining,
    eventCandidates: eventCandidates.length,
    experienceCandidates: experienceCandidates.length,
    missingEvents: missingEvents.length,
    missingExperiences: missingExperiences.length,
  }, { status: failed && updated === 0 ? 500 : 200 });
}
