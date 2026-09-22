import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { createPublicSearchController } from "@/lib/search/public-api/controller";
import {
  collectQaQueryMetrics,
  summarizeQaBatchDiversity,
} from "@/lib/search/quality/qaBatchMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERIES = 100;

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(max, Math.max(min, Math.trunc(numeric)))
    : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createQaPublicController() {
  return createPublicSearchController({
    getIdentity: async () => ({
      user: null,
      guestId: null,
      setGuestCookie: false,
    }) as any,
    checkLimit: async () => ({
      allowed: true,
      settings: { enabled: false },
      plan: {
        planKey: "free",
        unlimited: false,
        isBeta: false,
        isAdmin: false,
      },
      usedThisWeek: 0,
      weeklyLimit: null,
      message: null,
    }) as any,
    recordUsage: async () => undefined,
    logAnalytics: async () => ({ ok: true }),
    logSearchHealth: async () => ({ ok: true }),
    logRouteTiming: () => undefined,
  });
}

async function runPublicSearch(
  controller: ReturnType<typeof createPublicSearchController>,
  query: string,
  requestId: string,
) {
  const headers = new Headers();
  headers.set("content-type", "application/json");
  headers.set("x-request-id", requestId);
  const request = new Request("https://www.theouthaven.com/api/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({ input: query }),
  });
  const response = await controller(request);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    throw new Error(`Public search returned an unreadable response (${response.status}).`);
  }
  if (!response.ok && !payload.success) {
    throw new Error(
      payload?.error?.message ?? payload?.error ?? `Public search failed (${response.status}).`,
    );
  }
  return payload;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({}));
  const queries = strings(body?.queries).slice(
    0,
    clamp(body?.maxQueries, MAX_QUERIES, 1, MAX_QUERIES),
  );
  const delayMs = clamp(body?.delayMs, 100, 0, 5000);
  if (!queries.length) {
    return NextResponse.json(
      { ok: false, error: "At least one query is required." },
      { status: 400 },
    );
  }

  const controller = createQaPublicController();
  const rows: ReturnType<typeof collectQaQueryMetrics>[] = [];
  const errors: Array<{ index: number; query: string; error: string }> = [];

  for (const [index, query] of queries.entries()) {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    try {
      const result = await runPublicSearch(controller, query, requestId);
      rows.push(
        collectQaQueryMetrics({
          query,
          result,
          elapsedMs: Date.now() - started,
        }),
      );
    } catch (error) {
      errors.push({
        index,
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (index < queries.length - 1 && delayMs > 0) await sleep(delayMs);
  }

  return NextResponse.json({
    ok: errors.length === 0,
    executionPath: "/api/generate",
    queryCount: queries.length,
    completedCount: rows.length,
    failedCount: errors.length,
    diversity: summarizeQaBatchDiversity(rows),
    queries: rows,
    errors,
  });
}
