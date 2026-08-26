import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { cronDefinition, scheduleHintFor } from "@/lib/cron/controlPlane";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizeOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

function internalDispatchOrigin(request: NextRequest) {
  const explicitInternal = normalizeOrigin(process.env.INTERNAL_APP_ORIGIN);
  if (explicitInternal) return explicitInternal;

  const siteUrl = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) || normalizeOrigin(process.env.SITE_URL);
  if (siteUrl) return siteUrl;

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return `https://${productionHost}`;

  return request.nextUrl.origin;
}

async function invokeTarget(request: NextRequest, targetPath: string) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");

  const target = new URL(targetPath, internalDispatchOrigin(request));
  if (target.pathname === "/api/cron/managed") throw new Error("Managed cron target cannot point to itself.");

  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "x-cron-secret": secret,
    "x-theouthaven-cron-dispatcher": "managed",
  };
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (protectionBypass) headers["x-vercel-protection-bypass"] = protectionBypass;

  return fetch(target, {
    method: "GET",
    headers,
    cache: "no-store",
    redirect: "follow",
  });
}

type ParsedTargetResponse = {
  data: Record<string, unknown>;
  isJson: boolean;
  contentType: string;
};

async function parsedResponse(response: Response): Promise<ParsedTargetResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const text = await response.text();
  if (!text) return { data: {}, isJson: contentType.includes("json"), contentType };

  try {
    const parsed = JSON.parse(text);
    return {
      data: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { result: parsed },
      isJson: true,
      contentType,
    };
  } catch {
    return {
      data: {
        non_json_response: true,
        content_type: contentType || null,
        body_preview: text.replace(/\s+/g, " ").slice(0, 240),
        final_url: response.url || null,
      },
      isJson: false,
      contentType,
    };
  }
}

function targetErrorMessage(definitionName: string, response: Response, parsed: ParsedTargetResponse) {
  const candidates = [parsed.data.error, parsed.data.message, parsed.data.detail];
  const explicit = candidates.find((value) => typeof value === "string" && value.trim());
  if (typeof explicit === "string") return explicit;
  if (!parsed.isJson) {
    return `${definitionName} returned a non-JSON response instead of cron outcome data.`;
  }
  return `${definitionName} returned HTTP ${response.status}.`;
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
    const parsed = await parsedResponse(response);
    if (!response.ok || !parsed.isJson) {
      return NextResponse.json(
        { success: false, error: targetErrorMessage(definition.jobName, response, parsed), target: definition.targetPath, details: parsed.data },
        { status: response.ok ? 502 : response.status },
      );
    }
    return NextResponse.json(parsed.data, { status: response.status });
  }

  return runTrackedCron({
    jobKey: definition.jobKey,
    jobName: definition.jobName,
    routePath: definition.targetPath,
    scheduleHint: scheduleHintFor(definition.jobKey) ?? undefined,
    isManuallyRunnable: definition.manuallyRunnable,
    handler: async () => {
      const response = await invokeTarget(request, definition.targetPath);
      const parsed = await parsedResponse(response);
      if (!response.ok || !parsed.isJson) {
        throw new Error(targetErrorMessage(definition.jobName, response, parsed));
      }

      const targetReportedFailure = parsed.data.success === false || parsed.data.ok === false;
      if (targetReportedFailure) {
        throw new Error(targetErrorMessage(definition.jobName, response, parsed));
      }

      return {
        message: `${definition.jobName} completed through the managed scheduler.`,
        details: {
          http_status: response.status,
          target: definition.targetPath,
          final_url: response.url || null,
          ...parsed.data,
        },
        response: NextResponse.json(parsed.data, { status: response.status }),
      };
    },
  });
}
