import { NextRequest, NextResponse } from "next/server";
import { processDueSocialPublishJobs } from "@/lib/marketing/social-publishing";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processDueSocialPublishJobs(10);
    return NextResponse.json({ ok: result.failed === 0, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Marketing social publish worker failed." }, { status: 500 });
  }
}
