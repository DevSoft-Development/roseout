import { NextRequest, NextResponse } from "next/server";
import { getPlatformDrStatus, platformDrConfigured } from "@/lib/aws/platform-dr-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function runtimeSnapshot() {
  const provider = String(
    process.env.PLATFORM_RUNTIME_PROVIDER || (process.env.VERCEL ? "vercel" : "unknown"),
  ).trim();
  const revision = String(
    process.env.PLATFORM_RUNTIME_GIT_SHA
      || process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.GITHUB_SHA
      || "unknown",
  ).trim();

  return {
    ok: true,
    provider,
    revision,
    region: process.env.AWS_REGION || process.env.VERCEL_REGION || null,
    checkedAt: new Date().toISOString(),
    surfaces: [
      { key: "public", path: "/" },
      { key: "admin", path: "/admin/login" },
      { key: "locations", path: "/locations/dashboard" },
    ],
  };
}

function headers(snapshot: ReturnType<typeof runtimeSnapshot>) {
  return {
    "cache-control": "no-store, max-age=0",
    "x-toh-platform-origin": snapshot.provider,
    "x-toh-platform-revision": snapshot.revision,
  };
}

export async function GET(request: NextRequest) {
  const snapshot = runtimeSnapshot();
  if (request.nextUrl.searchParams.get("verifyDrControl") !== "1") {
    return NextResponse.json(snapshot, { status: 200, headers: headers(snapshot) });
  }

  const configured = platformDrConfigured();
  if (!configured) {
    return NextResponse.json({
      ...snapshot,
      drControl: { configured: false, healthy: false },
    }, { status: 200, headers: headers(snapshot) });
  }

  try {
    const status = await getPlatformDrStatus();
    return NextResponse.json({
      ...snapshot,
      drControl: {
        configured: true,
        healthy: status?.ok === true,
        mode: status?.state?.mode || null,
      },
    }, { status: 200, headers: headers(snapshot) });
  } catch {
    return NextResponse.json({
      ...snapshot,
      drControl: { configured: true, healthy: false },
    }, { status: 200, headers: headers(snapshot) });
  }
}

export async function HEAD() {
  const snapshot = runtimeSnapshot();
  return new NextResponse(null, { status: 200, headers: headers(snapshot) });
}
