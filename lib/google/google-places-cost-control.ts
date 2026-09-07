import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
  type GoogleBudgetSummary,
} from "@/lib/aws/location-intelligence-api";
import { sendSuperadminCriticalErrorEmail } from "@/lib/email/system-alerts";

export type GoogleCostPriority = "low" | "normal" | "high" | "critical";
export type GoogleCostOperation =
  | "text_search_ids_only"
  | "text_search_rich"
  | "place_details_address"
  | "place_details_rich"
  | "photo_metadata"
  | "photo_media";

export type GoogleCostContext = {
  jobKey?: string;
  priority?: GoogleCostPriority;
  queryKey?: string | null;
  placeId?: string | null;
  metadata?: Record<string, unknown>;
};

const OPERATION_CONFIG: Record<GoogleCostOperation, { sku: string; paid: boolean; estimatedUnitCostUsd: number }> = {
  text_search_ids_only: { sku: "text_search_ids_only", paid: false, estimatedUnitCostUsd: 0 },
  text_search_rich: { sku: "text_search_enterprise", paid: true, estimatedUnitCostUsd: 0.035 },
  place_details_address: { sku: "place_details_essentials", paid: true, estimatedUnitCostUsd: 0.005 },
  place_details_rich: { sku: "place_details_enterprise_atmosphere", paid: true, estimatedUnitCostUsd: 0.025 },
  photo_metadata: { sku: "place_details_ids_only", paid: false, estimatedUnitCostUsd: 0 },
  photo_media: { sku: "place_details_photos", paid: true, estimatedUnitCostUsd: 0.007 },
};

const BUDGET_SUMMARY_TTL_MS = 60_000;
const JOB_BUDGET_TTL_MS = 5 * 60_000;
const ALERT_THRESHOLDS = [50, 75, 90, 100] as const;
const DEFAULT_JOB_LIMIT = 5;
const DEFAULT_MINIMUM_CREDIT_RESERVE_USD = 15;

let cachedBudget: { value: GoogleBudgetSummary | null; expiresAt: number } = { value: null, expiresAt: 0 };
const jobBudgetCache = new Map<string, { value: { limit: number; priority: GoogleCostPriority; enabled: boolean }; expiresAt: number }>();

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeQuery(value: string) {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

export function googleSearchCacheKey(query: string, regionCode = "US") {
  return createHash("sha256").update(`${regionCode.toUpperCase()}|${normalizeQuery(query)}`).digest("hex");
}

export function googleCandidateMemoryKey(input: { placeId: string; jobKey: string; market?: string | null; area?: string | null; category?: string | null }) {
  return createHash("sha256")
    .update([input.jobKey, input.placeId, input.market || "", input.area || "", input.category || ""].join("|"))
    .digest("hex");
}

async function readBudgetSummary(force = false) {
  const now = Date.now();
  if (!force && cachedBudget.expiresAt > now) return cachedBudget.value;
  if (!locationIntelligenceApiConfigured()) {
    cachedBudget = { value: null, expiresAt: now + 15_000 };
    return null;
  }
  try {
    const value = await readGoogleBudgetSummaryViaLocationIntelligenceApi();
    cachedBudget = { value, expiresAt: now + BUDGET_SUMMARY_TTL_MS };
    void emitThresholdAlerts(value);
    return value;
  } catch {
    cachedBudget = { value: null, expiresAt: now + 15_000 };
    return null;
  }
}

async function readJobBudget(jobKey: string) {
  const key = clean(jobKey) || "unknown";
  const now = Date.now();
  const cached = jobBudgetCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  const { data } = await supabaseAdmin
    .from("google_places_job_budgets")
    .select("daily_paid_call_limit,priority,enabled")
    .eq("job_key", key)
    .maybeSingle();
  const value = {
    limit: Math.max(0, Number(data?.daily_paid_call_limit ?? DEFAULT_JOB_LIMIT)),
    priority: (["low", "normal", "high", "critical"].includes(String(data?.priority)) ? data?.priority : "normal") as GoogleCostPriority,
    enabled: data?.enabled !== false,
  };
  jobBudgetCache.set(key, { value, expiresAt: now + JOB_BUDGET_TTL_MS });
  return value;
}

async function paidCallsToday(jobKey: string) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from("google_places_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("job_key", jobKey)
    .eq("paid", true)
    .eq("blocked", false)
    .gte("occurred_at", start.toISOString());
  return Number(count || 0);
}

function minimumCreditReserve(summary: GoogleBudgetSummary | null) {
  const raw = Number(summary?.settings.minimumCreditReserveUsd);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MINIMUM_CREDIT_RESERVE_USD;
}

export function priorityAllowedForMode(priority: GoogleCostPriority, mode: GoogleBudgetSummary["operatingMode"] | "unknown") {
  if (mode === "normal" || mode === "unknown") return true;
  if (mode === "reduce_low_priority") return priority !== "low";
  if (mode === "critical_only") return priority === "high" || priority === "critical";
  if (mode === "stop_optional_paid_google") return priority === "critical";
  return false;
}

export class GoogleCostControlError extends Error {
  code = "google_places_cost_control_blocked";
  reason: string;
  constructor(reason: string) {
    super(`Google Places paid request blocked: ${reason}`);
    this.reason = reason;
  }
}

export function isGoogleCostControlError(error: unknown): error is GoogleCostControlError {
  return error instanceof GoogleCostControlError || (error instanceof Error && error.message.includes("Google Places paid request blocked:"));
}

export async function authorizeGoogleOperation(operation: GoogleCostOperation, context: GoogleCostContext = {}) {
  const config = OPERATION_CONFIG[operation];
  const jobKey = clean(context.jobKey) || "unknown";
  const jobBudget = await readJobBudget(jobKey);
  const priority = context.priority || jobBudget.priority;

  if (!config.paid) return { allowed: true, reason: "free_sku", priority, jobKey, config, summary: null as GoogleBudgetSummary | null };
  if (!jobBudget.enabled) return { allowed: false, reason: "job_disabled", priority, jobKey, config, summary: null as GoogleBudgetSummary | null };

  const [summary, used] = await Promise.all([readBudgetSummary(), paidCallsToday(jobKey)]);
  if (used >= jobBudget.limit) {
    return { allowed: false, reason: "daily_job_paid_call_limit", priority, jobKey, config, summary };
  }

  if (!summary) {
    const allowed = priority === "high" || priority === "critical";
    return { allowed, reason: allowed ? "budget_telemetry_unavailable_high_priority" : "budget_telemetry_unavailable", priority, jobKey, config, summary };
  }

  if (summary.settings.enabled === false) {
    return { allowed: false, reason: "paid_google_disabled", priority, jobKey, config, summary };
  }

  const reserve = minimumCreditReserve(summary);
  if (summary.estimatedCreditsRemainingUsd <= 0) {
    return { allowed: false, reason: "google_credit_balance_exhausted", priority, jobKey, config, summary };
  }
  if (summary.estimatedCreditsRemainingUsd <= reserve && priority !== "critical") {
    return { allowed: false, reason: "minimum_credit_reserve", priority, jobKey, config, summary };
  }
  if (!priorityAllowedForMode(priority, summary.operatingMode)) {
    return { allowed: false, reason: `operating_mode_${summary.operatingMode}`, priority, jobKey, config, summary };
  }
  return { allowed: true, reason: "allowed", priority, jobKey, config, summary };
}

export async function recordGoogleOperation(
  operation: GoogleCostOperation,
  context: GoogleCostContext,
  outcome: { blocked?: boolean; cacheHit?: boolean; reason?: string } = {},
) {
  const config = OPERATION_CONFIG[operation];
  const jobKey = clean(context.jobKey) || "unknown";
  try {
    await supabaseAdmin.from("google_places_usage_events").insert({
      job_key: jobKey,
      operation,
      sku: config.sku,
      priority: context.priority || "normal",
      paid: config.paid,
      blocked: outcome.blocked === true,
      cache_hit: outcome.cacheHit === true,
      reason: outcome.reason || null,
      query_key: context.queryKey || null,
      place_id: context.placeId || null,
      estimated_unit_cost_usd: outcome.blocked || outcome.cacheHit ? 0 : config.estimatedUnitCostUsd,
      metadata: context.metadata || {},
    });
  } catch {}
}

export async function enforceGoogleOperation(operation: GoogleCostOperation, context: GoogleCostContext = {}) {
  const decision = await authorizeGoogleOperation(operation, context);
  if (!decision.allowed) {
    await recordGoogleOperation(operation, { ...context, priority: decision.priority }, { blocked: true, reason: decision.reason });
    throw new GoogleCostControlError(decision.reason);
  }
  return decision;
}

export async function readIdSearchCache(query: string, regionCode = "US") {
  const cacheKey = googleSearchCacheKey(query, regionCode);
  const now = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("google_places_search_id_cache")
    .select("place_ids,expires_at")
    .eq("cache_key", cacheKey)
    .gt("expires_at", now)
    .maybeSingle();
  if (!data) return { cacheKey, placeIds: null as string[] | null };
  void supabaseAdmin.from("google_places_search_id_cache").update({ last_hit_at: now }).eq("cache_key", cacheKey);
  return { cacheKey, placeIds: Array.isArray(data.place_ids) ? data.place_ids.filter(Boolean) : [] };
}

export async function writeIdSearchCache(query: string, regionCode: string, placeIds: string[], ttlDays = 14, metadata: Record<string, unknown> = {}) {
  const cacheKey = googleSearchCacheKey(query, regionCode);
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(30, ttlDays)) * 86_400_000).toISOString();
  await supabaseAdmin.from("google_places_search_id_cache").upsert({
    cache_key: cacheKey,
    normalized_query: normalizeQuery(query),
    place_ids: Array.from(new Set(placeIds.filter(Boolean))).slice(0, 20),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
    metadata,
  }, { onConflict: "cache_key" });
  return cacheKey;
}

export async function readCandidateMemory(memoryKey: string) {
  const { data } = await supabaseAdmin
    .from("google_places_candidate_memory")
    .select("outcome,next_eligible_at")
    .eq("memory_key", memoryKey)
    .gt("next_eligible_at", new Date().toISOString())
    .maybeSingle();
  return data || null;
}

export async function writeCandidateMemory(input: {
  memoryKey: string;
  placeId: string;
  jobKey: string;
  market?: string | null;
  area?: string | null;
  category?: string | null;
  outcome: string;
  ttlDays: number;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const nextEligibleAt = new Date(now.getTime() + Math.max(1, Math.min(365, input.ttlDays)) * 86_400_000).toISOString();
  await supabaseAdmin.from("google_places_candidate_memory").upsert({
    memory_key: input.memoryKey,
    place_id: input.placeId,
    job_key: input.jobKey,
    market: input.market || null,
    area: input.area || null,
    category: input.category || null,
    outcome: input.outcome,
    next_eligible_at: nextEligibleAt,
    updated_at: now.toISOString(),
    metadata: input.metadata || {},
  }, { onConflict: "memory_key" });
}

async function emitThresholdAlerts(summary: GoogleBudgetSummary) {
  const hardCap = Number(summary.settings.hardCapUsd || 0);
  if (hardCap <= 0) return;
  const percent = Number(summary.percentOfHardCapUsed || 0);
  for (const threshold of ALERT_THRESHOLDS) {
    if (percent < threshold) continue;
    const { data, error } = await supabaseAdmin
      .from("google_places_budget_alerts")
      .insert({
        billing_month: String(summary.month).slice(0, 7),
        threshold_pct: threshold,
        spend_usd: summary.estimatedSpendUsd,
        hard_cap_usd: hardCap,
        credits_remaining_usd: summary.estimatedCreditsRemainingUsd,
        operating_mode: summary.operatingMode,
      })
      .select("id")
      .maybeSingle();
    if (error || !data?.id) continue;
    try {
      const delivery = await sendSuperadminCriticalErrorEmail({
        subject: `Google Places budget ${threshold}% threshold reached`,
        heading: "Google Places spend threshold",
        message: `TheOutHaven has reached ${percent.toFixed(1)}% of its Google Places hard cap. Estimated spend is $${summary.estimatedSpendUsd.toFixed(2)} with $${summary.estimatedCreditsRemainingUsd.toFixed(2)} promotional credit remaining. Operating mode: ${summary.operatingMode.replaceAll("_", " ")}.`,
        ctaUrl: "https://theouthaven.com/admin/dashboard/settings/google-places",
      });
      await supabaseAdmin.from("google_places_budget_alerts").update({ email_sent: Boolean((delivery as any)?.sent), email_error: (delivery as any)?.error || null }).eq("id", data.id);
    } catch (error) {
      await supabaseAdmin.from("google_places_budget_alerts").update({ email_error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500) }).eq("id", data.id);
    }
  }
}

export async function getGoogleCostControlAdminSnapshot() {
  const summary = await readBudgetSummary(true);
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [eventsResult, jobsResult, alertsResult] = await Promise.all([
    supabaseAdmin.from("google_places_usage_events").select("job_key,operation,paid,blocked,cache_hit,estimated_unit_cost_usd,occurred_at").gte("occurred_at", start.toISOString()).order("occurred_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("google_places_job_budgets").select("job_key,daily_paid_call_limit,priority,enabled,notes").order("job_key"),
    supabaseAdmin.from("google_places_budget_alerts").select("billing_month,threshold_pct,spend_usd,credits_remaining_usd,operating_mode,email_sent,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const byJob = new Map<string, { jobKey: string; calls: number; paidCalls: number; blocked: number; cacheHits: number; estimatedUnitSpendUsd: number }>();
  for (const event of eventsResult.data || []) {
    const key = String(event.job_key || "unknown");
    const row = byJob.get(key) || { jobKey: key, calls: 0, paidCalls: 0, blocked: 0, cacheHits: 0, estimatedUnitSpendUsd: 0 };
    row.calls += 1;
    if (event.paid && !event.blocked && !event.cache_hit) row.paidCalls += 1;
    if (event.blocked) row.blocked += 1;
    if (event.cache_hit) row.cacheHits += 1;
    row.estimatedUnitSpendUsd += Number(event.estimated_unit_cost_usd || 0);
    byJob.set(key, row);
  }
  return {
    summary,
    jobs: jobsResult.data || [],
    usageByJobToday: [...byJob.values()].sort((a, b) => b.paidCalls - a.paidCalls || b.calls - a.calls),
    alerts: alertsResult.data || [],
  };
}
