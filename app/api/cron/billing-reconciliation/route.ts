import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { requireServerEnv, requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const supabaseUrl = requireSupabaseUrl();
  const serviceRoleKey = requireSupabaseServiceRoleKey();
  const workerSecret = requireServerEnv("WORKER_INTERNAL_SECRET");
  const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") || 100), 250));

  const response = await fetch(`${supabaseUrl}/functions/v1/billing-reconciliation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "x-worker-secret": workerSecret,
    },
    body: JSON.stringify({ limit }),
    cache: "no-store",
  });

  const text = await response.text();
  let result: Record<string, unknown> = {};
  try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text.slice(0, 1000) }; }

  return NextResponse.json({
    success: response.ok && result.success !== false,
    cronName: "Stripe Billing Reconciliation",
    edgeFunction: "billing-reconciliation",
    result,
  }, { status: response.ok ? 200 : 502 });
}

export async function GET(request: NextRequest) {
  try { return await run(request); }
  catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return GET(request); }
