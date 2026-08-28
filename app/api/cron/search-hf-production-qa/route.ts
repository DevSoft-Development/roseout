import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/huggingFaceEmbedding";
import { searchV2 } from "@/lib/search/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const QUERIES = [
  "restaurant with hookah in the Bronx",
  "sports bar with wings",
  "restaurant with outdoor seating",
  "restaurant with private dining",
  "rooftop restaurant",
  "late night restaurant",
  "brunch with cocktails and outdoor seating",
  "group-friendly live music restaurant",
] as const;

async function authorized(request: Request) {
  const provided = request.headers.get("authorization");
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  if (cronSecret && provided === `Bearer ${cronSecret}`) return true;
  const runtimeConfig = await resolveSearchMlRuntimeConfig().catch(() => null);
  return Boolean(runtimeConfig?.token && provided === `Bearer ${runtimeConfig.token}`);
}

function parseDecision(decision: any) {
  try {
    return decision?.reason ? JSON.parse(decision.reason) : null;
  } catch {
    return decision?.reason ?? null;
  }
}

function cards(items: any[]) {
  return (items ?? []).slice(0, 5).map((item: any) => ({
    id: item?.id ?? null,
    name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? null,
    searchScore: item?.searchScore ?? null,
    retrievalGeoLevel: item?.retrieval_geo_level ?? null,
    matchReasons: Array.isArray(item?.matchReasons) ? item.matchReasons : [],
    whyMatched: item?.whyMatched ?? item?.why_it_matched ?? null,
  }));
}

function qaSnapshot(query: string, response: any, elapsedMs: number) {
  const decisions = Array.isArray(response?.debug?.decisions) ? response.debug.decisions : [];
  const semantic = decisions.find((item: any) => item?.stage === "hf_semantic_retrieval");
  const semanticCandidates = decisions.find((item: any) => item?.stage === "hf_semantic_candidates");
  const rerank = decisions.find((item: any) => item?.stage === "hf_cross_encoder_rerank");
  const requestedDomain = decisions.find((item: any) => item?.stage === "requested_domain_contract");
  const exactMenuEvidence = [...(response?.restaurants ?? []), ...(response?.activities ?? [])]
    .filter((item: any) => Array.isArray(item?.matchReasons) && item.matchReasons.some((reason: string) => /exact menu phrase match/i.test(reason)))
    .slice(0, 10)
    .map((item: any) => ({ id: item?.id ?? null, name: item?.name ?? item?.restaurant_name ?? item?.activity_name ?? null }));
  return {
    query,
    ok: response?.outcome !== "error",
    outcome: response?.outcome ?? null,
    requestFulfilled: response?.requestFulfilled ?? null,
    elapsedMs,
    timing: response?.timing ?? null,
    counts: response?.counts ?? {},
    retrieval: response?.retrieval ?? null,
    topRestaurants: cards(response?.restaurants ?? []),
    topActivities: cards(response?.activities ?? []),
    pairCount: Array.isArray(response?.pairs) ? response.pairs.length : 0,
    exactMenuEvidence,
    fallback: response?.fallback ?? null,
    semantic: semantic ? { decision: semantic.decision, details: parseDecision(semantic) } : null,
    semanticCandidates: semanticCandidates ? { decision: semanticCandidates.decision, details: parseDecision(semanticCandidates) } : null,
    rerank: rerank ? { decision: rerank.decision, details: parseDecision(rerank) } : null,
    requestedDomain: requestedDomain ? { decision: requestedDomain.decision, details: parseDecision(requestedDomain) } : null,
  };
}

export async function GET(request: Request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const runtimeConfig = await resolveSearchMlRuntimeConfig();
  const [{ data: remainingGeneral, error: generalError }, { data: remainingMenu, error: menuError }] = await Promise.all([
    supabaseAdmin.rpc("get_hf_search_embedding_backfill_candidates", {
      p_limit: 1,
      p_embedding_version: runtimeConfig.embeddingVersion,
    }),
    supabaseAdmin.rpc("get_hf_menu_embedding_backfill_candidates", {
      p_limit: 1,
      p_embedding_version: runtimeConfig.embeddingVersion,
    }),
  ]);
  if (generalError || menuError) {
    return NextResponse.json({ ok: false, error: generalError?.message ?? menuError?.message ?? "queue_check_failed" }, { status: 500 });
  }
  const generalQueueDrained = !Array.isArray(remainingGeneral) || remainingGeneral.length === 0;
  const menuQueueDrained = !Array.isArray(remainingMenu) || remainingMenu.length === 0;
  if (!generalQueueDrained || !menuQueueDrained) {
    return NextResponse.json({
      ok: false,
      pendingBackfill: true,
      generalQueueDrained,
      menuQueueDrained,
      embeddingVersion: runtimeConfig.embeddingVersion,
    }, { status: 425 });
  }

  const results: any[] = [];
  for (const query of QUERIES) {
    const started = performance.now();
    try {
      const response = await searchV2({
        query,
        requestId: `hf-production-qa:${crypto.randomUUID()}`,
        supabase: supabaseAdmin,
        rolloutOverride: { mode: "primary", canaryPercent: 100 },
      });
      results.push(qaSnapshot(query, response, performance.now() - started));
    } catch (error) {
      results.push({
        query,
        ok: false,
        elapsedMs: performance.now() - started,
        error: error instanceof Error ? error.message : "unknown_search_qa_failure",
      });
    }
  }

  const failed = results.filter((result) => result.ok === false);
  const missingMlTrace = results.filter((result) => result.ok !== false && (!result.semantic || !result.rerank));
  const latencies = results.map((result) => Number(result?.timing?.totalMs ?? result.elapsedMs ?? 0)).filter(Number.isFinite);
  const sorted = [...latencies].sort((a, b) => a - b);
  const percentile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 0;

  return NextResponse.json({
    ok: failed.length === 0 && missingMlTrace.length === 0,
    generatedAt: new Date().toISOString(),
    runtime: {
      endpoint: runtimeConfig.endpoint,
      semanticMode: runtimeConfig.semanticMode,
      rerankMode: runtimeConfig.rerankMode,
      embeddingModel: runtimeConfig.embeddingModel,
      embeddingVersion: runtimeConfig.embeddingVersion,
      rerankModel: runtimeConfig.rerankModel,
      rerankVersion: runtimeConfig.rerankVersion,
    },
    summary: {
      queryCount: results.length,
      failedCount: failed.length,
      missingMlTraceCount: missingMlTrace.length,
      p50TotalMs: percentile(0.5),
      p95TotalMs: percentile(0.95),
      maxTotalMs: sorted.at(-1) ?? 0,
    },
    results,
  }, { status: failed.length === 0 && missingMlTrace.length === 0 ? 200 : 503 });
}
