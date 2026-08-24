import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { cronDefinition, scheduleHintFor } from "@/lib/cron/controlPlane";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function invokeTarget(request: NextRequest, targetPath: string) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");

  const target = new URL(targetPath, request.nextUrl.origin);
  if (target.pathname === "/api/cron/managed") throw new Error("Managed cron target cannot point to itself.");

  return fetch(target, {
    method: "GET",
    headers: {
      authorization: `Bearer ${secret}`,
      "x-cron-secret": secret,
      "x-theouthaven-cron-dispatcher": "managed",
    },
    cache: "no-store",
  });
}

async function parsedResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { body: text.slice(0, 4000) };
  }
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const jobKey = request.nextUrl.searchParams.get("job")?.trim() || "";
  const definition = cronDefinition(jobKey);
  if (!definition) return NextResponse.json({ success: false, error: "Unknown managed cron job." }, { status: 404 });

  const { data: row } = await supabaseAdmin.from("cron_jobs").select("is_active").eq("job_key", jobKey).maybeSingle();
  if (row?.is_active === false) {
    return NextResponse.json({ success: true, skipped: true, reason: "job_disabled", job_key: jobKey });
  }

  if (definition.delivery === "direct") {
    const response = await invokeTarget(request, definition.targetPath);
    const data = await parsedResponse(response);
    return NextResponse.json(data, { status: response.status });
  }

  return runTrackedCron({
    jobKey: definition.jobKey,
    jobName: definition.jobName,
    routePath: definition.targetPath,
    scheduleHint: scheduleHintFor(definition.jobKey) ?? undefined,
    isManuallyRunnable: definition.manuallyRunnable,
    handler: async () => {
      const response = await invokeTarget(request, definition.targetPath);
      const data = await parsedResponse(response);
      if (!response.ok) {
        const message = typeof data?.error === "string" ? data.error : `${definition.jobName} returned HTTP ${response.status}.`;
        throw new Error(message);
      }
      return {
        message: `${definition.jobName} completed through the managed scheduler.`,
        details: { http_status: response.status, target: definition.targetPath, response: data },
        response: NextResponse.json(data, { status: response.status }),
      };
    },
  });
}
