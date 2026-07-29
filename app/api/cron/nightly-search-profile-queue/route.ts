import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function run(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization");
  if (!cronSecret || supplied !== `Bearer ${cronSecret}`) return unauthorized();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Supabase environment variables are missing" },
      { status: 500 },
    );
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/nightly-search-profile-queue`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ limit: 1500 }),
      cache: "no-store",
    },
  );

  const payload = await response.json().catch(() => ({ error: "Invalid edge function response" }));
  return NextResponse.json(payload, { status: response.status });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
