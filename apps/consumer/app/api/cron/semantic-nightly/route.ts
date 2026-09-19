import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AWS_BACKGROUND_ORIGIN = "http://127.0.0.1:3000";
const DEFAULT_SEMANTIC_BATCH_SIZE = 200;

async function invokeSemanticNightly(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");

  const target = new URL("/api/admin/semantic-nightly", AWS_BACKGROUND_ORIGIN);
  target.search = request.nextUrl.search;
  if (!target.searchParams.has("limit") && !target.searchParams.has("batch_size")) {
    target.searchParams.set("limit", String(DEFAULT_SEMANTIC_BATCH_SIZE));
  }

  const response = await fetch(target, {
    method: "GET",
    headers: {
      authorization: `Bearer ${secret}`,
      "x-cron-secret": secret,
      "x-toh-aws-internal": "semantic-nightly-dispatch",
    },
    cache: "no-store",
    redirect: "manual",
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error(`Semantic Nightly local dispatch redirected with HTTP ${response.status}.`);
  }

  const finalUrl = new URL(response.url || target.toString());
  if ((finalUrl.hostname !== "127.0.0.1" && finalUrl.hostname !== "localhost") || finalUrl.port !== "3000") {
    throw new Error(`Semantic Nightly dispatch escaped the private background runtime (${finalUrl.origin}).`);
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) {
    throw new Error(
      typeof payload?.error === "string" && payload.error.trim()
        ? payload.error
        : `Semantic Nightly returned HTTP ${response.status}.`,
    );
  }

  if (payload.success === false) {
    const failures = Array.isArray(payload.failures) ? payload.failures : [];
    const first = failures.find((value) => value && typeof value === "object") as { error?: unknown } | undefined;
    const detail = typeof first?.error === "string" ? first.error : "Semantic Nightly reported a processing failure.";
    throw new Error(detail);
  }

  return payload;
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "semantic-nightly",
    jobName: "Semantic Nightly",
    routePath: "/api/cron/semantic-nightly",
    description: "Refreshes deterministic semantic metadata, tags, and ranking scores. Search V2 embeddings are owned by Hugging Face; this job does not generate legacy OpenAI embeddings.",
    scheduleHint: "Daily at 5:40 AM UTC via AWS EventBridge Scheduler.",
    handler: async () => {
      const result = await invokeSemanticNightly(request);
      return {
        message: "Semantic Nightly deterministic metadata refresh completed successfully.",
        details: result,
        response: NextResponse.json(result),
      };
    },
  });
}
