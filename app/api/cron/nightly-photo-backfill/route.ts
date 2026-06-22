import { NextRequest, NextResponse } from "next/server";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";
import { requireCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getBaseUrl(request: NextRequest) {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (configured) return configured.startsWith("http") ? configured : `https://${configured}`;
  return request.nextUrl.origin;
}

function readMetric(data: any, key: string): number {
  const values = [data?.[key], data?.summary?.[key], data?.stats?.[key], data?.result?.[key]];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function buildTotals(steps: Array<{ data?: any }>) {
  const keys = ["found", "processed", "imported", "updated", "migrated", "enriched", "skipped", "failed", "needsPhoto", "publishReady", "review", "rejected"];
  return Object.fromEntries(keys.map((key) => [key, steps.reduce((sum, step) => sum + readMetric(step.data, key), 0)]));
}

async function callInternal(request: NextRequest, path: string, body: Record<string, unknown>) {
  const baseUrl = getBaseUrl(request);
  const secret = process.env.IMPORT_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return { path, ok: false, status: 500, data: { success: false, action: "internal_import", error: "Internal import secret is not configured." } };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-import-secret": secret,
      "x-skip-admin-import-email": "true",
      "x-cron-import-run": "true",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await response.json().catch(() => null);
  const normalizedData = json || {};

  return {
    path,
    ok: response.ok && normalizedData?.success !== false,
    status: response.status,
    data: {
      ...normalizedData,
      found: normalizedData?.found ?? normalizedData?.summary?.found ?? normalizedData?.stats?.found ?? normalizedData?.result?.found ?? null,
      processed: normalizedData?.processed ?? normalizedData?.summary?.processed ?? normalizedData?.stats?.processed ?? normalizedData?.result?.processed ?? null,
      imported: normalizedData?.imported ?? normalizedData?.summary?.imported ?? normalizedData?.stats?.imported ?? normalizedData?.result?.imported ?? null,
      updated: normalizedData?.updated ?? normalizedData?.summary?.updated ?? normalizedData?.stats?.updated ?? normalizedData?.result?.updated ?? null,
      migrated: normalizedData?.migrated ?? normalizedData?.summary?.migrated ?? normalizedData?.stats?.migrated ?? normalizedData?.result?.migrated ?? null,
      enriched: normalizedData?.enriched ?? normalizedData?.summary?.enriched ?? normalizedData?.stats?.enriched ?? normalizedData?.result?.enriched ?? null,
      skipped: normalizedData?.skipped ?? normalizedData?.summary?.skipped ?? normalizedData?.stats?.skipped ?? normalizedData?.result?.skipped ?? null,
      failed: normalizedData?.failed ?? normalizedData?.summary?.failed ?? normalizedData?.stats?.failed ?? normalizedData?.result?.failed ?? null,
      needsPhoto: normalizedData?.needsPhoto ?? normalizedData?.summary?.needsPhoto ?? normalizedData?.stats?.needsPhoto ?? normalizedData?.result?.needsPhoto ?? null,
      publishReady: normalizedData?.publishReady ?? normalizedData?.summary?.publishReady ?? normalizedData?.stats?.publishReady ?? normalizedData?.result?.publishReady ?? null,
      review: normalizedData?.review ?? normalizedData?.summary?.review ?? normalizedData?.stats?.review ?? normalizedData?.result?.review ?? null,
      rejected: normalizedData?.rejected ?? normalizedData?.summary?.rejected ?? normalizedData?.stats?.rejected ?? normalizedData?.result?.rejected ?? null,
      error: normalizedData?.error ?? normalizedData?.summary?.error ?? normalizedData?.stats?.error ?? normalizedData?.result?.error ?? null,
    },
  };
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const cronName = "Nightly Automatic Imports";
  const startedAtMs = Date.now();
  const startedAt = new Date().toISOString();
  const steps = [];

  steps.push(await callInternal(request, "/api/admin/location-growth/migrate-enriched-photos", { mode: "repair_bad_placeholders", limit: 150 }));
  steps.push(await callInternal(request, "/api/admin/location-growth/migrate-enriched-photos", { mode: "google_endpoint_to_storage", limit: 150 }));
  steps.push(await callInternal(request, "/api/admin/location-growth/migrate-enriched-photos", { mode: "repair_missing_completed", limit: 150 }));
  steps.push(await callInternal(request, "/api/admin/location-growth/enrich-high-value", { limit: 75 }));

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAtMs;
  const success = steps.every((step) => step.ok);
  const totals = buildTotals(steps);

  const emailResult = await sendCronImportSummaryEmail({ success, cronName, startedAt, finishedAt, durationMs, steps });

  return NextResponse.json({
    success,
    action: "nightly_photo_backfill",
    cronName,
    startedAt,
    finishedAt,
    durationMs,
    counts: totals,
    steps,
    emailSent: emailResult.sent,
    emailProvider: emailResult.provider,
    emailError: emailResult.error || null,
  });
}
