import { NextRequest } from "next/server";
import { POST as handleMarketingReportsPost } from "@/app/api/admin/marketing/reports/route";
import { requireCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  const internalRequest = new Request(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({ action: "process_due" }),
  });

  return handleMarketingReportsPost(internalRequest);
}
