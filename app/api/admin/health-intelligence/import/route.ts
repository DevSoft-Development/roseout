import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { importNycDohmhHealthData } from "@/lib/health/nycDohmh";

export const dynamic = "force-dynamic";

type ImportOptions = {
  limit?: number;
  batchSize?: number;
  maxPages?: number;
  dryRun?: boolean;
  sinceDate?: string | null;
};

function isAuthorized(req: Request) {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const cronSecret = req.headers.get("x-cron-secret") || "";
  return auth === `Bearer ${secret}` || cronSecret === secret;
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
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized health intelligence import request." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const options = await parseOptions(req);
  const summary = await importNycDohmhHealthData({ supabase, ...options });
  return NextResponse.json(summary, { status: summary.success ? 200 : 500 });
}

export async function GET(req: Request) { return handleImport(req); }
export async function POST(req: Request) { return handleImport(req); }
