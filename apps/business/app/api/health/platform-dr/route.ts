import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function snapshot() {
  const provider = String(process.env.PLATFORM_RUNTIME_PROVIDER || "unknown").trim();
  const revision = String(process.env.PLATFORM_RUNTIME_GIT_SHA || process.env.GITHUB_SHA || "unknown").trim();
  return {
    ok: true,
    provider,
    revision,
    region: process.env.AWS_REGION || null,
    checkedAt: new Date().toISOString(),
  };
}

function headers(value: ReturnType<typeof snapshot>) {
  return {
    "cache-control": "no-store, max-age=0",
    "x-toh-platform-origin": value.provider,
    "x-toh-platform-revision": value.revision,
  };
}

export async function GET() {
  const value = snapshot();
  return NextResponse.json(value, { status: 200, headers: headers(value) });
}

export async function HEAD() {
  const value = snapshot();
  return new NextResponse(null, { status: 200, headers: headers(value) });
}
