import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
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

  return runTrackedCron({
    jobKey: "website-dr-readiness",
    jobName: "Website DR Readiness",
    routePath: "/api/cron/website-dr-readiness/aws",
    description: "Checks website DR readiness from AWS without treating a Vercel API read restriction as scheduler failure.",
    handler: async () => {
      try {
        const dns = await checkPlatformWildcardDnsCapability();
        const body = {
          ok: true,
          ready: true,
          degraded: false,
          platformDns: {
            status: "ready",
            recordType: dns.type,
            recordName: dns.name,
            currentValue: dns.value,
          },
        };
        return {
          message: "Website DR readiness check completed.",
          details: body,
          response: NextResponse.json(body),
        };
      } catch (error) {
        if (!isRecoverableVercelReadRestriction(error)) throw error;

        const body = {
          ok: true,
          ready: false,
          degraded: true,
          warning: "vercel_dns_read_forbidden_from_aws_runtime",
          platformDns: { status: "degraded" },
        };
        return {
          message: "Website DR readiness completed with an AWS-only Vercel DNS read warning.",
          details: body,
          response: NextResponse.json(body),
        };
      }
    },
  });
}
