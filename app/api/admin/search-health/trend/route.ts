import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Granularity = "hourly" | "daily";
type RangeKey = "24h" | "7d" | "30d";

type TrendRow = {
  created_at: string;
  success: boolean | null;
  had_issue: boolean | null;
  result_count: number | null;
  no_results_reason: string | null;
  no_pairs_reason: string | null;
};

const RANGE_MS: Record<RangeKey, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function parseRange(value: string | null): RangeKey {
  return value === "7d" || value === "30d" ? value : "24h";
}

function parseGranularity(value: string | null, range: RangeKey): Granularity {
  if (value === "hourly" || value === "daily") return value;
  return range === "24h" ? "hourly" : "daily";
}

function validIso(value: string | null) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function bucketFor(value: string, granularity: Granularity) {
  const date = new Date(value);
  if (granularity === "hourly") {
    date.setUTCMinutes(0, 0, 0);
    return date.toISOString();
  }
  return date.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const range = parseRange(searchParams.get("range"));
    const granularity = parseGranularity(searchParams.get("granularity"), range);
    const now = new Date();
    const from =
      validIso(searchParams.get("from")) ??
      new Date(now.getTime() - RANGE_MS[range]).toISOString();
    const to = validIso(searchParams.get("to")) ?? now.toISOString();
    const source = (searchParams.get("source") ?? "all").trim().slice(0, 80);

    let query = supabaseAdmin
      .from("search_events")
      .select(
        "created_at,success,had_issue,result_count,no_results_reason,no_pairs_reason",
      )
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .range(0, 9999);

    if (source && source !== "all") query = query.eq("source", source);

    const result = await query;
    if (result.error) throw result.error;

    const rows = (result.data ?? []) as TrendRow[];
    const buckets = new Map<string, { date: string; healthy: number; issues: number }>();

    for (const row of rows) {
      const date = bucketFor(row.created_at, granularity);
      const point = buckets.get(date) ?? { date, healthy: 0, issues: 0 };
      const hasIssue =
        row.success === false ||
        row.had_issue === true ||
        row.result_count === 0 ||
        row.no_results_reason !== null ||
        row.no_pairs_reason !== null;

      if (hasIssue) point.issues += 1;
      else point.healthy += 1;
      buckets.set(date, point);
    }

    return NextResponse.json(
      {
        data: Array.from(buckets.values()),
        granularity,
        lastEventAt: rows.at(-1)?.created_at ?? null,
        generatedAt: now.toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[admin/search-health/trend] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trend data could not be loaded." },
      { status: 500 },
    );
  }
}
