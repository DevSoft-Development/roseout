import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THRESHOLDS = {
  minimumQaSamples: 150,
  qaQualityPassPercent: 95,
  hardContractPassPercent: 95,
  semanticCoveragePercent: 95,
  hoursCoveragePercent: 95,
  productionTechnicalSuccessPercent: 99,
  minimumProductionSamples: 20,
  productionP95Ms: 3000,
} as const;

const round = (value: number, digits = 1) => Number(value.toFixed(digits));
const percent = (numerator: number, denominator: number) => denominator > 0 ? round((numerator / denominator) * 100) : null;

function p95(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    searchableResult,
    embeddingResult,
    hoursResult,
    qaResult,
    productionResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("is_searchable", true)
      .eq("active", true)
      .eq("is_hidden", false)
      .is("deleted_at", null),
    supabaseAdmin
      .from("location_search_embeddings")
      .select("location_id", { count: "exact", head: true })
      .eq("status", "ready"),
    supabaseAdmin
      .from("locations")
      .select("id", { count: "exact", head: true })
      .eq("is_searchable", true)
      .eq("active", true)
      .eq("is_hidden", false)
      .is("deleted_at", null)
      .or("hours.not.is.null,operating_hours.not.is.null,google_regular_opening_hours.not.is.null,google_current_opening_hours.not.is.null"),
    supabaseAdmin
      .from("search_logs")
      .select("created_at,technical_success,quality_success,quality_issue_type,quality_findings")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("search_events")
      .select("created_at,success,technical_success,had_issue,timing_ms,speed_status")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const databaseErrors = [searchableResult.error, embeddingResult.error, hoursResult.error, qaResult.error, productionResult.error].filter(Boolean);
  if (databaseErrors.length) {
    return NextResponse.json({
      ok: false,
      error: databaseErrors.map((error) => error?.message ?? "unknown database error").join("; "),
    }, { status: 500 });
  }

  const searchable = Number(searchableResult.count ?? 0);
  const readyEmbeddings = Number(embeddingResult.count ?? 0);
  const hoursCovered = Number(hoursResult.count ?? 0);
  const semanticCoverage = percent(Math.min(readyEmbeddings, searchable), searchable);
  const hoursCoverage = percent(hoursCovered, searchable);

  const qaRows = (qaResult.data ?? [])
    .filter((row: any) => row?.quality_findings?.source === "admin_search_health_batch_qa")
    .slice(0, 250);
  const qaSamples = qaRows.length;
  const qaQualityPassed = qaRows.filter((row: any) => row.quality_success === true).length;
  const qaTechnicalPassed = qaRows.filter((row: any) => row.technical_success === true).length;
  const contractEvidence = qaRows
    .map((row: any) => bool(row?.quality_findings?.contractPass))
    .filter((value): value is boolean => value != null);
  const contractPassed = contractEvidence.filter(Boolean).length;
  const qaQualityPassPercent = percent(qaQualityPassed, qaSamples);
  const qaTechnicalPassPercent = percent(qaTechnicalPassed, qaSamples);
  const hardContractPassPercent = percent(contractPassed, contractEvidence.length);

  const productionRows = productionResult.data ?? [];
  const productionTimings = productionRows.map((row: any) => Number(row.timing_ms)).filter(Number.isFinite);
  const productionTechnicalPassed = productionRows.filter((row: any) => row.technical_success === true || (row.technical_success == null && row.success === true && row.had_issue !== true)).length;
  const productionTechnicalSuccessPercent = percent(productionTechnicalPassed, productionRows.length);
  const productionP95Ms = p95(productionTimings);

  const gates = {
    qaEvidence: qaSamples >= THRESHOLDS.minimumQaSamples,
    qaQuality: qaQualityPassPercent != null && qaQualityPassPercent >= THRESHOLDS.qaQualityPassPercent,
    hardContracts: contractEvidence.length >= THRESHOLDS.minimumQaSamples && hardContractPassPercent != null && hardContractPassPercent >= THRESHOLDS.hardContractPassPercent,
    semanticCoverage: semanticCoverage != null && semanticCoverage >= THRESHOLDS.semanticCoveragePercent,
    hoursCoverage: hoursCoverage != null && hoursCoverage >= THRESHOLDS.hoursCoveragePercent,
    productionEvidence: productionRows.length >= THRESHOLDS.minimumProductionSamples,
    productionTechnical: productionTechnicalSuccessPercent != null && productionTechnicalSuccessPercent >= THRESHOLDS.productionTechnicalSuccessPercent,
    productionLatency: productionP95Ms != null && productionP95Ms <= THRESHOLDS.productionP95Ms,
  };

  const blockerLabels: Record<keyof typeof gates, string> = {
    qaEvidence: `Run at least ${THRESHOLDS.minimumQaSamples} exact-public QA cases.`,
    qaQuality: `QA quality pass rate must be at least ${THRESHOLDS.qaQualityPassPercent}%.`,
    hardContracts: `At least ${THRESHOLDS.minimumQaSamples} QA cases must include passing intent/geo/retrieval/pairing/canonical-profile contract evidence.`,
    semanticCoverage: `Ready semantic embeddings must cover at least ${THRESHOLDS.semanticCoveragePercent}% of searchable locations.`,
    hoursCoverage: `Structured hours must cover at least ${THRESHOLDS.hoursCoveragePercent}% of searchable locations.`,
    productionEvidence: `Collect at least ${THRESHOLDS.minimumProductionSamples} production searches in the last 24 hours.`,
    productionTechnical: `Production technical success must be at least ${THRESHOLDS.productionTechnicalSuccessPercent}%.`,
    productionLatency: `Production p95 search latency must be at or below ${THRESHOLDS.productionP95Ms} ms.`,
  };
  const blockers = (Object.entries(gates) as Array<[keyof typeof gates, boolean]>)
    .filter(([, passed]) => !passed)
    .map(([gate]) => ({ gate, message: blockerLabels[gate] }));
  const passedGateCount = Object.values(gates).filter(Boolean).length;
  const readinessPercent = round((passedGateCount / Object.keys(gates).length) * 100);
  const enoughEvidence = gates.qaEvidence && gates.productionEvidence;
  const severeFailure = enoughEvidence && ((qaQualityPassPercent ?? 100) < 80 || (productionTechnicalSuccessPercent ?? 100) < 90);
  const status = blockers.length === 0 ? "green" : severeFailure ? "red" : "yellow";

  return NextResponse.json({
    ok: true,
    status,
    readyFor95: blockers.length === 0,
    readinessPercent,
    thresholds: THRESHOLDS,
    gates,
    blockers,
    evidence: {
      inventory: {
        searchableLocations: searchable,
        readyEmbeddings,
        semanticCoveragePercent: semanticCoverage,
        hoursCoveredLocations: hoursCovered,
        hoursCoveragePercent: hoursCoverage,
      },
      exactPublicQa: {
        sampleCount: qaSamples,
        qualityPassed: qaQualityPassed,
        qualityPassPercent: qaQualityPassPercent,
        technicalPassPercent: qaTechnicalPassPercent,
        contractEvidenceCount: contractEvidence.length,
        hardContractPassPercent,
        newestAt: qaRows[0]?.created_at ?? null,
        oldestIncludedAt: qaRows.at(-1)?.created_at ?? null,
      },
      production24h: {
        sampleCount: productionRows.length,
        technicalSuccessPercent: productionTechnicalSuccessPercent,
        p95Ms: productionP95Ms,
        timingSampleCount: productionTimings.length,
        newestAt: productionRows[0]?.created_at ?? null,
      },
    },
  });
}
