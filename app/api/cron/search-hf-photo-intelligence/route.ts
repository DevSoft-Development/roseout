import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchHuggingFaceImageClassification, fetchHuggingFaceImageEmbedding, resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";

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
  } catch {
    return null;
  }
}

function collectPhotos(row: any) {
  const values = [
    row.owner_primary_photo_url,
    ...(row.owner_photo_urls ?? []),
    row.storage_photo_url,
    row.google_photo_url,
    row.image_url,
    row.main_image,
    ...(row.images ?? []),
    ...(row.gallery_images ?? []),
  ];
  return [...new Set(values
    .map((value: any) => typeof value === "string" ? value : value?.url)
    .map(safePhotoUrl)
    .filter(Boolean))] as string[];
}

function photoKey(photoUrl: string) {
  return createHash("sha256").update(photoUrl).digest("hex");
}

async function fetchImage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "TheOutHavenPhotoIntelligence/1.2" },
    });
    if (!response.ok) throw new Error(`image_http_${response.status}`);
    const finalUrl = new URL(response.url);
    if (finalUrl.protocol !== "https:" || finalUrl.hostname === "localhost" || finalUrl.hostname.endsWith(".local") || isIP(finalUrl.hostname)) {
      throw new Error("unsafe_redirect_target");
    }
    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error("not_image");
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > 3_000_000) throw new Error("image_too_large");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 3_000_000) throw new Error("image_too_large");
    return buffer.toString("base64");
  } finally {
    clearTimeout(timer);
  }
}

function scoreMap(rows: Array<{ label: string; score: number }>) {
  return Object.fromEntries(rows.map((row) => [row.label, row.score]));
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function searchableLocationsQuery() {
  return supabaseAdmin.from("locations")
    .select("id,owner_primary_photo_url,owner_photo_urls,storage_photo_url,google_photo_url,image_url,main_image,images,gallery_images,updated_at")
    .eq("is_searchable", true)
    .eq("is_hidden", false)
    .eq("active", true)
    .is("deleted_at", null);
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const config = await resolveSearchMlRuntimeConfig();
  if (config.photoIntelligenceMode === "disabled") return NextResponse.json({ ok: true, skipped: true, reason: "photo_intelligence_disabled" });

  const batchSize = boundedInteger(process.env.SEARCH_HF_PHOTO_LOCATION_BATCH_SIZE, 8, 1, 20);
  const failedRetryMinutes = boundedInteger(process.env.SEARCH_HF_PHOTO_FAILED_RETRY_MINUTES, 360, 5, 10080);
  const { count, error: countError } = await supabaseAdmin.from("locations")
    .select("id", { count: "exact", head: true })
    .eq("is_searchable", true).eq("is_hidden", false).eq("active", true).is("deleted_at", null);
  if (countError) return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
  const searchableCount = count ?? 0;
  if (!searchableCount) return NextResponse.json({ ok: true, mode: config.photoIntelligenceMode, scored: 0, embedded: 0, readyVectors: 0, failed: 0, scannedLocations: 0, searchableCount: 0 });

  const [{ data: existingScores, error: scoreError }, { data: existingVectors, error: vectorError }] = await Promise.all([
    supabaseAdmin.from("location_photo_ml_scores")
      .select("location_id,photo_key,model_version,status,calculated_at")
      .eq("model_version", config.visionVersion)
      .order("calculated_at", { ascending: false })
      .limit(10000),
    supabaseAdmin.from("location_photo_embeddings_siglip")
      .select("location_id,photo_key,model_version,status,calculated_at")
      .eq("model_version", config.visionVersion)
      .order("calculated_at", { ascending: false })
      .limit(10000),
  ]);
  if (scoreError) return NextResponse.json({ ok: false, error: scoreError.message }, { status: 500 });
  if (vectorError) return NextResponse.json({ ok: false, error: vectorError.message }, { status: 500 });

  const readyScoreKeys = new Set((existingScores ?? []).filter((row: any) => row.status === "ready").map((row: any) => String(row.photo_key)));
  const readyVectorKeys = new Set((existingVectors ?? []).filter((row: any) => row.status === "ready").map((row: any) => String(row.photo_key)));
  const failedRetryCutoff = Date.now() - failedRetryMinutes * 60_000;
  const recentlyFailedScoreKeys = new Set((existingScores ?? [])
    .filter((row: any) => row.status === "failed" && Date.parse(String(row.calculated_at ?? "")) >= failedRetryCutoff)
    .map((row: any) => String(row.photo_key)));

  const { data: candidateLocations, error } = await searchableLocationsQuery().order("updated_at", { ascending: false }).limit(Math.min(searchableCount, 5000));
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const analyzedLocations = (candidateLocations ?? []).map((row: any) => {
    const photos = collectPhotos(row).slice(0, 5);
    const pendingKeys = photos
      .map(photoKey)
      .filter((key) => !(readyScoreKeys.has(key) && readyVectorKeys.has(key)));
    const freshPendingKeys = pendingKeys.filter((key) => !recentlyFailedScoreKeys.has(key));
    return { row, pendingCount: pendingKeys.length, freshPendingCount: freshPendingKeys.length };
  }).filter((entry) => entry.pendingCount > 0);

  const locations = [
    ...analyzedLocations.filter((entry) => entry.freshPendingCount > 0),
    ...analyzedLocations.filter((entry) => entry.freshPendingCount === 0),
  ].slice(0, batchSize).map((entry) => entry.row);

  let scored = 0;
  let embedded = 0;
  let failed = 0;
  let skippedReady = 0;
  let skippedRecentFailure = 0;
  let locationsWithPhotos = 0;

  for (const location of locations) {
    const photos = collectPhotos(location).slice(0, 5);
    if (photos.length) locationsWithPhotos += 1;
    for (const photoUrl of photos) {
      const key = photoKey(photoUrl);
      const scoreReady = readyScoreKeys.has(key);
      const vectorReady = readyVectorKeys.has(key);
      if (scoreReady && vectorReady) {
        skippedReady += 1;
        continue;
      }
      if (recentlyFailedScoreKeys.has(key)) {
        skippedRecentFailure += 1;
        continue;
      }

      try {
        const base64 = await fetchImage(photoUrl);
        const [labels, vector] = await Promise.all([
          scoreReady ? Promise.resolve(null) : fetchHuggingFaceImageClassification(base64, { timeoutMs: 10_000 }),
          vectorReady ? Promise.resolve(null) : fetchHuggingFaceImageEmbedding(base64, { timeoutMs: 10_000 }),
        ]);

        if (labels) {
          const scores = scoreMap(labels);
          const positive = labels.filter((row) => row.score >= 0.55).map((row) => row.label);
          const lowQuality = Number(scores["blurry or low quality photo"] ?? 0);
          const heroScore = Math.max(0, Math.min(1,
            Math.max(
              Number(scores["restaurant interior"] ?? 0),
              Number(scores["plated food"] ?? 0),
              Number(scores["rooftop or skyline view"] ?? 0),
              Number(scores["building exterior"] ?? 0),
            ) - lowQuality * 0.55
            - Number(scores["menu or text"] ?? 0) * 0.25
            - Number(scores["logo or graphic"] ?? 0) * 0.35,
          ));
          const { error: upsertError } = await supabaseAdmin.from("location_photo_ml_scores").upsert({
            location_id: location.id,
            photo_key: key,
            photo_url: photoUrl,
            labels: positive,
            label_scores: scores,
            hero_score: heroScore,
            food_score: scores["plated food"] ?? 0,
            interior_score: scores["restaurant interior"] ?? 0,
            exterior_score: scores["building exterior"] ?? 0,
            rooftop_score: scores["rooftop or skyline view"] ?? 0,
            menu_score: scores["menu or text"] ?? 0,
            logo_score: scores["logo or graphic"] ?? 0,
            people_score: scores["people or crowd"] ?? 0,
            low_quality_score: lowQuality,
            model: config.visionModel,
            model_version: config.visionVersion,
            status: "ready",
            calculated_at: new Date().toISOString(),
            error_message: null,
          }, { onConflict: "photo_key" });
          if (upsertError) throw upsertError;
          scored += 1;
        }

        if (vector) {
          const { error: vectorUpsertError } = await supabaseAdmin.from("location_photo_embeddings_siglip").upsert({
            location_id: location.id,
            photo_key: key,
            photo_url: photoUrl,
            embedding: vector,
            model: config.visionModel,
            model_version: config.visionVersion,
            status: "ready",
            calculated_at: new Date().toISOString(),
            error_message: null,
          }, { onConflict: "photo_key" });
          if (vectorUpsertError) throw vectorUpsertError;
          embedded += 1;
        }
      } catch (caught) {
        failed += 1;
        const message = caught instanceof Error ? caught.message : "photo_intelligence_failed";
        if (!scoreReady) await supabaseAdmin.from("location_photo_ml_scores").upsert({ location_id: location.id, photo_key: key, photo_url: photoUrl, model: config.visionModel, model_version: config.visionVersion, status: "failed", calculated_at: new Date().toISOString(), error_message: message }, { onConflict: "photo_key" });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    degraded: failed > 0,
    mode: config.photoIntelligenceMode,
    model: config.visionModel,
    scored,
    embedded,
    readyVectors: readyVectorKeys.size + embedded,
    failed,
    skippedReady,
    skippedRecentFailure,
    scannedLocations: locations.length,
    locationsWithPhotos,
    searchableCount,
    batchSize,
    failedRetryMinutes,
    pendingLocations: analyzedLocations.length,
    freshPendingLocations: analyzedLocations.filter((entry) => entry.freshPendingCount > 0).length,
  });
}
