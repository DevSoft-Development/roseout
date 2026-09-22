import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ShadowSummary = {
  index: number;
  query: string;
  ok: boolean;
  candidateShadowMode: string | null;
  candidateShadowEdgeAttempted: boolean;
  candidateShadowEdgeSucceeded: boolean;
  candidateShadowContractMatched: boolean | null;
  candidateShadowRestaurantCount: number | null;
  candidateShadowActivityCount: number | null;
  candidateShadowRestaurantOverlap: number | null;
  candidateShadowActivityOverlap: number | null;
  candidateShadowRestaurantTop10Overlap: number | null;
  candidateShadowActivityTop10Overlap: number | null;
  candidateShadowDuplicateRestaurantIds: number | null;
  candidateShadowDuplicateActivityIds: number | null;
  candidateShadowEdgeMs: number | null;
  candidateShadowError: string | null;
};

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? (value as Record<string, any>) : {};
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNumberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function debugFromResult(result: unknown) {
  const row = asObject(result);
  const payload = asObject(row.result);
  return asObject(payload.debug ?? asObject(payload.diagnostics).debug);
}

function buildShadowSummary(rowValue: unknown): ShadowSummary {
  const row = asObject(rowValue);
  const debug = debugFromResult(row);
  const baseSummary = asObject(row.summary);

  return {
    index: asNumberOrNull(row.index) ?? asNumberOrNull(baseSummary.index) ?? 0,
    query: asStringOrNull(row.query) ?? asStringOrNull(baseSummary.query) ?? "",
    ok: asBoolean(baseSummary.ok),
    candidateShadowMode: asStringOrNull(debug.candidateShadowMode),
    candidateShadowEdgeAttempted: asBoolean(debug.candidateShadowEdgeAttempted),
    candidateShadowEdgeSucceeded: asBoolean(debug.candidateShadowEdgeSucceeded),
    candidateShadowContractMatched:
      typeof debug.candidateShadowContractMatched === "boolean"
        ? debug.candidateShadowContractMatched
        : null,
    candidateShadowRestaurantCount: asNumberOrNull(
      debug.candidateShadowRestaurantCount,
    ),
    candidateShadowActivityCount: asNumberOrNull(
      debug.candidateShadowActivityCount,
    ),
    candidateShadowRestaurantOverlap: asNumberOrNull(
      debug.candidateShadowRestaurantOverlap,
    ),
    candidateShadowActivityOverlap: asNumberOrNull(
      debug.candidateShadowActivityOverlap,
    ),
    candidateShadowRestaurantTop10Overlap: asNumberOrNull(
      debug.candidateShadowRestaurantTop10Overlap,
    ),
    candidateShadowActivityTop10Overlap: asNumberOrNull(
      debug.candidateShadowActivityTop10Overlap,
    ),
    candidateShadowDuplicateRestaurantIds: asNumberOrNull(
      debug.candidateShadowDuplicateRestaurantIds,
    ),
    candidateShadowDuplicateActivityIds: asNumberOrNull(
      debug.candidateShadowDuplicateActivityIds,
    ),
    candidateShadowEdgeMs: asNumberOrNull(debug.candidateShadowEdgeMs),
    candidateShadowError: asStringOrNull(debug.candidateShadowError),
  };
}

function buildTotals(summary: ShadowSummary[]) {
  const attempted = summary.filter((row) => row.candidateShadowEdgeAttempted);
  const succeeded = attempted.filter((row) => row.candidateShadowEdgeSucceeded);
  const contractMatched = succeeded.filter(
    (row) => row.candidateShadowContractMatched === true,
  );
  const duplicateFree = succeeded.filter(
    (row) =>
      (row.candidateShadowDuplicateRestaurantIds ?? 0) === 0 &&
      (row.candidateShadowDuplicateActivityIds ?? 0) === 0,
  );

  return {
    totalQueries: summary.length,
    edgeAttempted: attempted.length,
    edgeSucceeded: succeeded.length,
    edgeSuccessRate:
      attempted.length === 0
        ? null
        : Number((succeeded.length / attempted.length).toFixed(4)),
    contractMatched: contractMatched.length,
    contractMatchRate:
      succeeded.length === 0
        ? null
        : Number((contractMatched.length / succeeded.length).toFixed(4)),
    duplicateFree: duplicateFree.length,
    duplicateFreeRate:
      succeeded.length === 0
        ? null
        : Number((duplicateFree.length / succeeded.length).toFixed(4)),
    averageEdgeMs:
      succeeded.length === 0
        ? null
        : Number(
            (
              succeeded.reduce(
                (sum, row) => sum + (row.candidateShadowEdgeMs ?? 0),
                0,
              ) / succeeded.length
            ).toFixed(2),
          ),
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";
  const authorization = request.headers.get("authorization") ?? "";

  const response = await fetch(`${origin}/api/admin/search-health/batch-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify({
      ...body,
      includeFullDebug: true,
    }),
    cache: "no-store",
  });

  const batch = await response.json().catch(() => null);
  if (!response.ok || !batch) {
    return NextResponse.json(
      {
        ok: false,
        error:
          batch?.error ??
          `Batch search-health request failed with status ${response.status}.`,
      },
      { status: response.status || 500 },
    );
  }

  const summary = Array.isArray(batch.results)
    ? batch.results.map(buildShadowSummary)
    : [];

  return NextResponse.json({
    ok: true,
    startedAt: batch.startedAt ?? null,
    finishedAt: batch.finishedAt ?? null,
    count: summary.length,
    architecture: {
      edgeResponsibility: "candidate_retrieval_only",
      nextjsResponsibility: [
        "intent_parsing",
        "taxonomy_expansion",
        "anchor_resolution",
        "ranking",
        "ml_scoring",
        "pairing",
        "walking_rules",
        "recovery",
        "fallbacks",
        "final_results",
      ],
      publicResultProvider: "app",
      edgeMode: "shadow",
    },
    totals: buildTotals(summary),
    summary,
  });
}
