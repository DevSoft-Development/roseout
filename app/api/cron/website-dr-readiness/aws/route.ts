import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { checkPlatformWildcardDnsCapability } from "@/lib/domains/vercel-wildcard-failover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isRecoverableVercelReadRestriction(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /^vercel_dns_list_failed_v\d+:403:/.test(message);
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  try {
    const dns = await checkPlatformWildcardDnsCapability();
    return NextResponse.json({
      ok: true,
      ready: true,
      degraded: false,
      platformDns: {
        status: "ready",
        recordType: dns.type,
        recordName: dns.name,
        currentValue: dns.value,
      },
    });
  } catch (error) {
    if (isRecoverableVercelReadRestriction(error)) {
      return NextResponse.json({
        ok: true,
        ready: false,
        degraded: true,
        warning: "vercel_dns_read_forbidden_from_aws_runtime",
        platformDns: { status: "degraded" },
      });
    }

    return NextResponse.json(
      {
        ok: false,
        ready: false,
        degraded: true,
        error: error instanceof Error ? error.message : "website_dr_dns_readiness_failed",
      },
      { status: 503 },
    );
  }
}
