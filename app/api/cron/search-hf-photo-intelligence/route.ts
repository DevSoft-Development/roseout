import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchHuggingFaceImageClassification, resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

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

function safePhotoUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || isIP(host)) return null;
    return url.toString();
  } catch { return null; }
}

function collectPhotos(row: any) {
  const values = [row.owner_primary_photo_url, ...(row.owner_photo_urls ?? []), row.primary_photo_url, row.cached_photo_url, row.google_photo_url, ...(row.images ?? []), ...(row.gallery_images ?? []), ...(row.photos ?? [])];
  return [...new Set(values.map((value: any) => typeof value === "string" ? value : value?.url).map(safePhotoUrl).filter(Boolean))] as string[];
}

async function fetchImage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { redirect: "error", signal: controller.signal, headers: { "user-agent": "TheOutHavenPhotoIntelligence/1.0" } });
    if (!response.ok) throw new Error(`image_http_${response.status}`);
    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error("not_image");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 3_000_000) throw new Error("image_too_large");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 3_000_000) throw new Error("image_too_large");
    return buffer.toString("base64");
  } finally { clearTimeout(timer); }
}

function scoreMap(rows: Array<{ label: string; score: number }>) { return Object.fromEntries(rows.map((row) => [row.label, row.score])); }

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const config = await resolveSearchMlRuntimeConfig();
  if (config.photoIntelligenceMode === "disabled") return NextResponse.json({ ok: true, skipped: true, reason: "photo_intelligence_disabled" });
  const { data: locations, error } = await supabaseAdmin.from("locations")
    .select("id,owner_primary_photo_url,owner_photo_urls,primary_photo_url,cached_photo_url,google_photo_url,images,gallery_images,photos")
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null).limit(8);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  let scored = 0; let failed = 0;
  for (const location of locations ?? []) {
    for (const photoUrl of collectPhotos(location).slice(0, 5)) {
      const photoKey = createHash("sha256").update(photoUrl).digest("hex");
      const { data: existing } = await supabaseAdmin.from("location_photo_ml_scores").select("model_version,status").eq("photo_key", photoKey).maybeSingle();
      if (existing?.model_version === config.visionVersion && existing?.status === "ready") continue;
      try {
        const base64 = await fetchImage(photoUrl);
        const labels = await fetchHuggingFaceImageClassification(base64, { timeoutMs: 10_000 });
        const scores = scoreMap(labels);
        const positive = labels.filter((row) => row.score >= 0.55).map((row) => row.label);
        const lowQuality = Number(scores["blurry or low quality photo"] ?? 0);
        const heroScore = Math.max(0, Math.min(1, Math.max(Number(scores["restaurant interior"] ?? 0), Number(scores["plated food"] ?? 0), Number(scores["rooftop or skyline view"] ?? 0), Number(scores["building exterior"] ?? 0)) - lowQuality * 0.55 - Number(scores["menu or text"] ?? 0) * 0.25 - Number(scores["logo or graphic"] ?? 0) * 0.35));
        const { error: upsertError } = await supabaseAdmin.from("location_photo_ml_scores").upsert({
          location_id: location.id, photo_key: photoKey, photo_url: photoUrl, labels: positive, label_scores: scores,
          hero_score: heroScore, food_score: scores["plated food"] ?? 0, interior_score: scores["restaurant interior"] ?? 0,
          exterior_score: scores["building exterior"] ?? 0, rooftop_score: scores["rooftop or skyline view"] ?? 0,
          menu_score: scores["menu or text"] ?? 0, logo_score: scores["logo or graphic"] ?? 0, people_score: scores["people or crowd"] ?? 0,
          low_quality_score: lowQuality, model: config.visionModel, model_version: config.visionVersion, status: "ready", calculated_at: new Date().toISOString(), error_message: null,
        }, { onConflict: "photo_key" });
        if (upsertError) throw upsertError;
        scored += 1;
      } catch (caught) {
        failed += 1;
        await supabaseAdmin.from("location_photo_ml_scores").upsert({ location_id: location.id, photo_key: photoKey, photo_url: photoUrl, model: config.visionModel, model_version: config.visionVersion, status: "failed", calculated_at: new Date().toISOString(), error_message: caught instanceof Error ? caught.message : "photo_classification_failed" }, { onConflict: "photo_key" });
      }
    }
  }
  return NextResponse.json({ ok: failed === 0, mode: config.photoIntelligenceMode, scored, failed, model: config.visionModel });
}
