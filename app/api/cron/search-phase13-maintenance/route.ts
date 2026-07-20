import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationSemanticDocument, EMBEDDING_MODEL, EMBEDDING_VERSION } from "@/lib/search/enterprise/semantic";
import { classifySearchLocation } from "@/lib/search/enterprise/classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

async function embed(text: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const model = process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text }),
  });
  if (!response.ok) throw new Error(`embedding request failed: ${response.status}`);
  const payload = await response.json();
  return payload?.data?.[0]?.embedding as number[];
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const behavior = await supabaseAdmin.rpc("recalculate_behavioral_search_features", { p_window: "30 days" });
  const { data: rows, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .eq("is_hidden", false)
    .eq("active", true)
    .is("deleted_at", null)
    .limit(Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE || 50));
  if (error) return NextResponse.json({ ok: false, behavior: behavior.data ?? null, error: error.message }, { status: 500 });

  let updated = 0;
  const failures: Array<{ locationId: string; error: string }> = [];
  for (const location of rows ?? []) {
    try {
      const document = buildLocationSemanticDocument(location as any);
      if (!document.eligibleForPublicEmbedding) continue;
      const classification = classifySearchLocation(location as any);
      if (classification.canonicalType === "unsupported" || classification.canonicalType === "nightlife") continue;
      const embedding = await embed(document.semanticDocument);
      const { error: upsertError } = await supabaseAdmin.from("location_search_embeddings").upsert({
        location_id: location.id,
        embedding,
        canonical_search_type: classification.canonicalType,
        market_key: location.market ?? location.default_market_id ?? null,
        embedding_model: process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
        embedding_version: process.env.SEARCH_EMBEDDING_VERSION || EMBEDDING_VERSION,
        semantic_document_hash: document.semanticDocumentHash,
        semantic_document_version: document.semanticDocumentVersion,
        status: "ready",
        calculated_at: new Date().toISOString(),
        error_message: null,
      }, { onConflict: "location_id" });
      if (upsertError) throw upsertError;
      updated += 1;
    } catch (caught) {
      failures.push({ locationId: String(location.id), error: caught instanceof Error ? caught.message : "unknown_error" });
    }
  }

  await supabaseAdmin.from("search_embedding_runs").insert({
    status: failures.length ? "completed_with_errors" : "completed",
    embedding_model: process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL,
    embedding_version: process.env.SEARCH_EMBEDDING_VERSION || EMBEDDING_VERSION,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    records_scanned: rows?.length ?? 0,
    records_updated: updated,
    records_failed: failures.length,
    errors: failures.slice(0, 20),
  });

  return NextResponse.json({ ok: true, behavior: behavior.data ?? null, embeddings: { scanned: rows?.length ?? 0, updated, failed: failures.length, failures: failures.slice(0, 10) } });
}
