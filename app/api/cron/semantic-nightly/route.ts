import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const AWS_BACKGROUND_ORIGIN = "http://127.0.0.1:3000";

type SemanticFailure = {
  id?: unknown;
  error?: unknown;
};

function failureMessage(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmbeddingWarning(value: SemanticFailure) {
  return failureMessage(value?.error) === "embedding_failed";
}

async function invokeSemanticNightly(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) throw new Error("CRON_SECRET is not configured.");

  const target = new URL("/api/admin/semantic-nightly", AWS_BACKGROUND_ORIGIN);
  target.search = request.nextUrl.search;

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

  const failures = Array.isArray(payload.failures)
    ? payload.failures.filter((value): value is SemanticFailure => Boolean(value) && typeof value === "object")
    : [];
  const embeddingWarnings = failures.filter(isEmbeddingWarning);
  const hardFailures = failures.filter((failure) => !isEmbeddingWarning(failure));

  if (hardFailures.length > 0 || (payload.success === false && failures.length === 0)) {
    const first = hardFailures.map((failure) => failureMessage(failure.error)).find(Boolean);
    throw new Error(first || "Semantic Nightly reported a hard processing failure.");
  }

  const normalized = {
    ...payload,
    success: true,
    failures: hardFailures,
    warnings: embeddingWarnings,
    degraded: embeddingWarnings.length > 0,
    embedding_failures: embeddingWarnings.length,
  };

  return normalized;
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "semantic-nightly",
    jobName: "Semantic Nightly",
    routePath: "/api/cron/semantic-nightly",
    description: "Refreshes semantic search metadata while treating embedding-provider fallback as retryable degradation instead of a hard job failure.",
    scheduleHint: "Daily at 5:40 AM UTC via AWS EventBridge Scheduler.",
    handler: async () => {
      const result = await invokeSemanticNightly(request);
      return {
        message: result.degraded
          ? `Semantic Nightly completed with ${result.embedding_failures} embedding warning(s) queued for refresh.`
          : "Semantic Nightly completed successfully.",
        details: result,
        response: NextResponse.json(result),
      };
    },
  });
}
