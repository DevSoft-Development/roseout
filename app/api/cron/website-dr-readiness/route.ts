import { NextRequest, NextResponse } from "next/server";
import { checkPlatformWildcardDnsCapability } from "@/lib/domains/vercel-wildcard-failover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dns = await checkPlatformWildcardDnsCapability();
    return NextResponse.json({
      ok: true,
      platformDns: {
        status: "ready",
        recordType: dns.type,
        recordName: dns.name,
        currentValue: dns.value,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "website_dr_dns_readiness_failed";
    console.error("Website DR DNS readiness check failed", { error: message });
    return NextResponse.json(
      {
        ok: false,
        platformDns: {
          status: "degraded",
          error: message,
        },
      },
      { status: 503 },
    );
  }
}
