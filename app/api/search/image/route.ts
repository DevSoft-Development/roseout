import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchHuggingFaceImageEmbedding, resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";
import { SEARCH_LOCATION_SELECT } from "@/lib/search/v2/retrieval/locationSearchSelect";
import { sanitizePublicLocation } from "@/lib/search/v2/response/sanitizePublicLocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function normalized(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const config = await resolveSearchMlRuntimeConfig();
    if (config.photoIntelligenceMode === "disabled") {
      return NextResponse.json({ ok: false, error: "visual_search_disabled" }, { status: 503 });
    }
    const body = await request.json().catch(() => null);
    const raw = String(body?.imageBase64 ?? body?.image_base64 ?? "").trim();
    const imageBase64 = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
    if (!imageBase64 || imageBase64.length > 4_200_000) {
      return NextResponse.json({ ok: false, error: "invalid_image_payload" }, { status: 400 });
    }
    const limit = Math.max(1, Math.min(30, Number(body?.limit ?? 12)));
    const city = normalized(body?.city);
    const borough = normalized(body?.borough);
    const vector = await fetchHuggingFaceImageEmbedding(imageBase64, { timeoutMs: 10_000 });
    const { data: matches, error } = await supabaseAdmin.rpc("match_location_photo_embeddings_siglip", {
      p_query_embedding: vector,
      p_match_count: Math.min(100, Math.max(limit * 4, 30)),
      p_min_similarity: Number(process.env.SEARCH_HF_VISUAL_MIN_SIMILARITY || 0.45),
      p_model_version: config.visionVersion,
    });
    if (error) throw error;
    const bestByLocation = new Map<string, any>();
    for (const row of matches ?? []) {
      const id = String(row.location_id);
      const existing = bestByLocation.get(id);
      if (!existing || Number(row.similarity) > Number(existing.similarity)) bestByLocation.set(id, row);
    }
    const ids = [...bestByLocation.keys()];
    const { data: locations, error: locationError } = ids.length
      ? await supabaseAdmin.from("locations").select(SEARCH_LOCATION_SELECT).in("id", ids)
      : { data: [] as any[], error: null };
    if (locationError) throw locationError;
    const results = (locations ?? [])
      .filter((row: any) => !city || normalized(row.city) === city)
      .filter((row: any) => !borough || normalized(row.borough) === borough)
      .map((row: any) => {
        const match = bestByLocation.get(String(row.id));
        return {
          location: sanitizePublicLocation(row as any),
          similarity: Number(match?.similarity ?? 0),
          matchedPhotoUrl: match?.photo_url ?? null,
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
    return NextResponse.json({
      ok: true,
      model: config.visionModel,
      modelVersion: config.visionVersion,
      count: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "visual_search_failed" }, { status: 500 });
  }
}
