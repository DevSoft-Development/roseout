import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  locationIntelligenceApiConfigured,
  readGoogleBudgetSummaryViaLocationIntelligenceApi,
  type GoogleBudgetSummary,
} from "@/lib/aws/location-intelligence-api";
import { sendSuperadminCriticalErrorEmail } from "@/lib/email/system-alerts";

const ALERT_THRESHOLDS = [50, 75, 90, 100] as const;

async function emitThresholdAlerts(summary: GoogleBudgetSummary) {
  const hardCap = Number(summary.settings.hardCapUsd || 0);
  if (hardCap <= 0) return;

  const percent = Number(summary.percentOfHardCapUsed || 0);
  const adminDb = getAdminDatabaseClient();

  for (const threshold of ALERT_THRESHOLDS) {
    if (percent < threshold) continue;

    const { data, error } = await adminDb
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
        message: `TheOutHaven has reached ${percent.toFixed(
          1,
        )}% of its Google Places hard cap. Estimated spend is $${summary.estimatedSpendUsd.toFixed(
          2,
        )} with $${summary.estimatedCreditsRemainingUsd.toFixed(
          2,
        )} promotional credit remaining. Operating mode: ${summary.operatingMode.replaceAll(
          "_",
          " ",
        )}.`,
        ctaUrl:
          "https://admin.theouthaven.com/admin/dashboard/settings/google-places",
      });

      await adminDb
        .from("google_places_budget_alerts")
        .update({
          email_sent: Boolean(delivery.sent),
          email_error: delivery.error || null,
        })
        .eq("id", data.id);
    } catch (caught) {
      await adminDb
        .from("google_places_budget_alerts")
        .update({
          email_error:
            caught instanceof Error
              ? caught.message.slice(0, 500)
              : String(caught).slice(0, 500),
        })
        .eq("id", data.id);
    }
  }
}

export async function getGoogleCostControlAdminSnapshot() {
  let summary: GoogleBudgetSummary | null = null;

  if (locationIntelligenceApiConfigured()) {
    try {
      summary =
        await readGoogleBudgetSummaryViaLocationIntelligenceApi();
      void emitThresholdAlerts(summary);
    } catch {
      summary = null;
    }
  }

  const adminDb = getAdminDatabaseClient();
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const [eventsResult, jobsResult, alertsResult] = await Promise.all([
    adminDb
      .from("google_places_usage_events")
      .select(
        "job_key,operation,paid,blocked,cache_hit,estimated_unit_cost_usd,occurred_at",
      )
      .gte("occurred_at", start.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(1000),
    adminDb
      .from("google_places_job_budgets")
      .select(
        "job_key,daily_paid_call_limit,priority,enabled,notes",
      )
      .order("job_key"),
    adminDb
      .from("google_places_budget_alerts")
      .select(
        "billing_month,threshold_pct,spend_usd,credits_remaining_usd,operating_mode,email_sent,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const byJob = new Map<
    string,
    {
      jobKey: string;
      calls: number;
      paidCalls: number;
      blocked: number;
      cacheHits: number;
      estimatedUnitSpendUsd: number;
    }
  >();

  for (const event of eventsResult.data || []) {
    const key = String(event.job_key || "unknown");
    const row = byJob.get(key) || {
      jobKey: key,
      calls: 0,
      paidCalls: 0,
      blocked: 0,
      cacheHits: 0,
      estimatedUnitSpendUsd: 0,
    };

    row.calls += 1;
    if (event.paid && !event.blocked && !event.cache_hit) {
      row.paidCalls += 1;
    }
    if (event.blocked) row.blocked += 1;
    if (event.cache_hit) row.cacheHits += 1;
    row.estimatedUnitSpendUsd += Number(
      event.estimated_unit_cost_usd || 0,
    );

    byJob.set(key, row);
  }

  return {
    summary,
    jobs: jobsResult.data || [],
    usageByJobToday: [...byJob.values()].sort(
      (a, b) => b.paidCalls - a.paidCalls || b.calls - a.calls,
    ),
    alerts: alertsResult.data || [],
  };
}
