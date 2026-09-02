import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { cronDefinition, scheduleHintFor } from "@/lib/cron/controlPlane";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AWS_BACKGROUND_ORIGIN = "http://127.0.0.1:3000";

function normalizeOrigin(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/$/, "");
}

function safeAppOrigin(value: string | undefined) {
  const normalized = normalizeOrigin(value);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    const shortLinkHost = String(process.env.SHORT_LINK_HOST || "").trim().toLowerCase();
    const hostname = url.hostname.toLowerCase();

    if (shortLinkHost && hostname === shortLinkHost) return null;

    if (hostname === "theouthaven.com") {
      url.hostname = "www.theouthaven.com";
    }

    return url.origin;
  } catch {
    return null;
  }
}

function isAwsBackgroundRequest(request: NextRequest) {
  return (
    request.headers.get("x-toh-aws-internal") === "eventbridge" ||
    String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background"
  );
}

function internalDispatchOrigin(request: NextRequest) {
  // Never let an AWS background invocation inherit a public web origin from the
  // Vercel build environment. The private Lambda must dispatch its managed
  // target back into the standalone server running in the same Lambda image.
  if (isAwsBackgroundRequest(request)) return AWS_BACKGROUND_ORIGIN;

  const candidates = [
    process.env.INTERNAL_APP_ORIGIN,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    request.nextUrl.origin,
  ];

  for (const candidate of candidates) {
    const origin = safeAppOrigin(candidate);
    if (origin) return origin;
  }

  return "https://www.theouthaven.com";
}

function assertPrivateAwsDispatch(response: Response, target: URL) {
  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `AWS managed cron local dispatch unexpectedly redirected with HTTP ${response.status}.`,
    );
  }

  const finalUrl = new URL(response.url || target.toString());
  const localHost = finalUrl.hostname === "127.0.0.1" || finalUrl.hostname === "localhost";
  if (!localHost || finalUrl.port !== "3000") {
    throw new Error(
      `AWS managed cron local dispatch escaped the private background runtime (${finalUrl.origin}).`,
    );
  }
}

async function invokeTarget(request: NextRequest, targetPath: string) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");

  const awsBackground = isAwsBackgroundRequest(request);
  const target = new URL(targetPath, internalDispatchOrigin(request));
  if (target.pathname === "/api/cron/managed") throw new Error("Managed cron target cannot point to itself.");

  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "x-cron-secret": secret,
    "x-theouthaven-cron-dispatcher": "managed",
  };
  if (awsBackground) headers["x-toh-aws-internal"] = "managed-dispatch";

  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (protectionBypass && !awsBackground) headers["x-vercel-protection-bypass"] = protectionBypass;

  const response = await fetch(target, {
    method: "GET",
    headers,
    cache: "no-store",
    // A background-runtime target must never be allowed to follow a redirect to
    // the public app. Treat any redirect as a migration safety failure instead.
    redirect: awsBackground ? "manual" : "follow",
  });

  if (awsBackground) assertPrivateAwsDispatch(response, target);
  return response;
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

function dryRunRequested(request: NextRequest) {
  const value = request.nextUrl.searchParams.get("dry_run")?.trim().toLowerCase();
  return value === "true" || value === "1";
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const jobKey = request.nextUrl.searchParams.get("job")?.trim() || "";
  const definition = cronDefinition(jobKey);
  if (!definition) return NextResponse.json({ success: false, error: "Unknown managed cron job." }, { status: 404 });
  const dryRun = dryRunRequested(request);

  const { data: row } = await supabaseAdmin.from("cron_jobs").select("is_active").eq("job_key", jobKey).maybeSingle();
  if (row?.is_active === false) {
    return NextResponse.json({ success: true, skipped: true, reason: "job_disabled", job_key: jobKey });
  }

  if (definition.delivery === "direct") {
    if (dryRun) {
      return NextResponse.json({
        success: true,
        dry_run: true,
        side_effects: false,
        job_key: definition.jobKey,
        target: definition.targetPath,
        delivery: "direct",
      });
    }

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
    suppressConfiguredEmail: dryRun,
    handler: async () => {
      if (dryRun) {
        const payload = {
          success: true,
          dry_run: true,
          side_effects: false,
          job_key: definition.jobKey,
          target: definition.targetPath,
          runtime_provider: String(process.env.PLATFORM_RUNTIME_PROVIDER || "web"),
          private_dispatch: isAwsBackgroundRequest(request),
        };
        return {
          message: `${definition.jobName} dry run completed without invoking the business target.`,
          details: payload,
          response: NextResponse.json(payload),
        };
      }

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
          runtime_provider: String(process.env.PLATFORM_RUNTIME_PROVIDER || "web"),
          private_dispatch: isAwsBackgroundRequest(request),
          ...parsed.data,
        },
        response: NextResponse.json(parsed.data, { status: response.status }),
      };
    },
  });
}
