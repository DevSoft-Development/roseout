import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { importNycDohmhHealthData } from "@/lib/health/nycDohmh";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request) {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const cronSecret = req.headers.get("x-cron-secret") || "";
  return auth === `Bearer ${secret}` || cronSecret === secret;
}

function defaultSinceDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 14);
  return date.toISOString().slice(0, 10);
}

async function handleCron(req: Request) {
  const startedAt = new Date();
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized health intelligence cron request." }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const summary = await importNycDohmhHealthData({ supabase, limit: 10000, batchSize: 1000, maxPages: 10, dryRun: false, sinceDate: defaultSinceDate() });
  const finishedAt = new Date();
  return NextResponse.json({
    success: summary.success,
    cronName: "Nightly Health Department Intelligence",
    scheduledFor: "3:30 AM",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    summary,
  }, { status: summary.success ? 200 : 500 });
}

export async function GET(req: Request) { return handleCron(req); }
export async function POST(req: Request) { return handleCron(req); }
