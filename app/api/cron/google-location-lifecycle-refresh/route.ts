import { NextRequest, NextResponse } from "next/server";
import { processGoogleLifecycleRefresh } from "@/lib/location-data-quality/google-lifecycle-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const supplied = request.headers.get("authorization");
  return Boolean(process.env.CRON_SECRET && supplied === `Bearer ${process.env.CRON_SECRET}`);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Number(request.nextUrl.searchParams.get("limit") || 25);
  const staleDays = Number(request.nextUrl.searchParams.get("stale_days") || 30);

  try {
    const result = await processGoogleLifecycleRefresh(limit, staleDays);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
