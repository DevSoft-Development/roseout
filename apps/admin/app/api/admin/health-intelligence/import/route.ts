import { NextResponse } from "next/server";
import { importNycDohmhHealthData } from "@/lib/health/nycDohmh";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { requireSuperAdmin } from "@/lib/admin-api-auth";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

type ImportOptions = {
  limit?: number;
  batchSize?: number;
  maxPages?: number;
  dryRun?: boolean;
  sinceDate?: string | null;
};

async function authorizeImport(req: Request) {
  if (isCronRequestAuthorized(req)) return null;
  const { error } = await requireSuperAdmin();
  return error;
}

function numberOption(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function parseOptions(req: Request): Promise<Required<ImportOptions>> {
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const get = (key: string) => body[key] ?? url.searchParams.get(key);
  return {
    limit: numberOption(get("limit"), 5000),
    batchSize: numberOption(get("batchSize"), 1000),
    maxPages: numberOption(get("maxPages"), 5),
    dryRun: String(get("dryRun") ?? "false").toLowerCase() === "true" || get("dryRun") === true,
    sinceDate: get("sinceDate") ? String(get("sinceDate")) : null,
  };
}

async function handleImport(req: Request) {
  const authError = await authorizeImport(req);
  if (authError) return authError;
  const supabase = getSupabaseAdminClient();
  const options = await parseOptions(req);
  const summary = await importNycDohmhHealthData({ supabase, ...options });
  return NextResponse.json({ ...summary, action: "health_intelligence_import" }, { status: summary.success ? 200 : 500 });
}

export async function GET(req: Request) { return handleImport(req); }
export async function POST(req: Request) { return handleImport(req); }
