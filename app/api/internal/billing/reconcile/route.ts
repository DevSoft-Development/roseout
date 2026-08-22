import { NextRequest, NextResponse } from "next/server";
import { normalizeBillingStatus } from "@/lib/billing/plans";
import { logEvent } from "@/lib/monitoring";
import { stripeRequest } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StripeSubscription = {
  id: string;
  status?: string;
  customer?: string | { id?: string } | null;
  current_period_start?: number | null;
  current_period_end?: number | null;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  currency?: string | null;
  items?: { data?: Array<{ price?: { id?: string; unit_amount?: number | null; currency?: string | null; recurring?: { interval?: string | null } } }> };
};

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function authorized(request: NextRequest) {
  const secret = String(process.env.WORKER_INTERNAL_SECRET || "").trim();
  if (!secret) return false;
  const supplied = String(request.headers.get("x-worker-secret") || request.headers.get("x-internal-worker-secret") || "").trim();
  return secureCompare(supplied, secret);
}

const toIso = (seconds?: number | null) => seconds ? new Date(seconds * 1000).toISOString() : null;
const addDays = (value: Date, days: number) => new Date(value.getTime() + days * 86400000).toISOString();

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 100), 250));
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: locations, error: readError } = await supabaseAdmin
    .from("locations")
    .select("id,subscription_plan,subscription_status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,next_billing_date,trial_ends_at,cancel_at_period_end,canceled_at,stripe_price_id,subscription_interval,subscription_amount_cents,subscription_currency,past_due_at,billing_grace_ends_at")
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });

  let scanned = 0;
  let updated = 0;
  let drifted = 0;
  let failed = 0;
  const failures: Array<{ locationId: string; message: string }> = [];

  for (const location of locations || []) {
    scanned += 1;
    const subscriptionId = String(location.stripe_subscription_id || "").trim();
    if (!subscriptionId) continue;

    try {
      const subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
      const stripeStatus = normalizeBillingStatus(subscription.status);
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id || null;
      const price = subscription.items?.data?.[0]?.price || {};

      let effectiveStatus = stripeStatus;
      let pastDueAt = location.past_due_at || null;
      let graceEndsAt = location.billing_grace_ends_at || null;

      if (stripeStatus === "past_due") {
        const firstFailure = pastDueAt ? new Date(pastDueAt) : now;
        pastDueAt = pastDueAt || firstFailure.toISOString();
        graceEndsAt = graceEndsAt || addDays(firstFailure, 14);
        effectiveStatus = new Date(graceEndsAt).getTime() > now.getTime() ? "grace_period" : "past_due";
      } else if (["active", "trialing"].includes(stripeStatus)) {
        pastDueAt = null;
        graceEndsAt = null;
      } else if (["canceled", "incomplete_expired"].includes(stripeStatus)) {
        graceEndsAt = null;
      }

      const nextPlan = ["canceled", "incomplete_expired"].includes(stripeStatus) ? "free_discovery" : "business_pro";
      const patch = {
        subscription_plan: nextPlan,
        subscription_status: effectiveStatus,
        stripe_customer_id: customerId || location.stripe_customer_id || null,
        stripe_subscription_id: subscription.id,
        current_period_start: toIso(subscription.current_period_start),
        current_period_end: toIso(subscription.current_period_end),
        next_billing_date: toIso(subscription.current_period_end),
        trial_ends_at: toIso(subscription.trial_end),
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        canceled_at: toIso(subscription.canceled_at),
        stripe_price_id: price.id || null,
        subscription_interval: price.recurring?.interval || null,
        subscription_amount_cents: price.unit_amount ?? null,
        subscription_currency: price.currency || subscription.currency || "usd",
        past_due_at: pastDueAt,
        billing_grace_ends_at: graceEndsAt,
        updated_at: nowIso,
      };

      const drift =
        String(location.subscription_plan || "") !== String(patch.subscription_plan) ||
        String(location.subscription_status || "") !== String(patch.subscription_status) ||
        Boolean(location.cancel_at_period_end) !== Boolean(patch.cancel_at_period_end) ||
        String(location.stripe_price_id || "") !== String(patch.stripe_price_id || "") ||
        String(location.subscription_interval || "") !== String(patch.subscription_interval || "") ||
        Number(location.subscription_amount_cents || 0) !== Number(patch.subscription_amount_cents || 0);

      if (drift) drifted += 1;
      const { error: updateError } = await supabaseAdmin.from("locations").update(patch).eq("id", location.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      failed += 1;
      failures.push({ locationId: String(location.id), message: error instanceof Error ? error.message : String(error) });
    }
  }

  const { data: expiredGrace, error: expiredError } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("subscription_status", "grace_period")
    .not("billing_grace_ends_at", "is", null)
    .lte("billing_grace_ends_at", nowIso)
    .limit(250);

  let graceExpired = 0;
  if (!expiredError && expiredGrace?.length) {
    const ids = expiredGrace.map((row) => row.id);
    const { error } = await supabaseAdmin
      .from("locations")
      .update({ subscription_status: "past_due", updated_at: nowIso })
      .in("id", ids);
    if (!error) graceExpired = ids.length;
  }

  await logEvent(failed ? "failed_stripe" : "admin_activity", {
    action: "billing_reconciliation",
    scanned,
    updated,
    drifted,
    graceExpired,
    failed,
    failures: failures.slice(0, 10),
  });

  return NextResponse.json({
    success: failed === 0,
    scanned,
    updated,
    drifted,
    graceExpired,
    failed,
    failures: failures.slice(0, 10),
  }, { status: failed === scanned && scanned > 0 ? 500 : 200 });
}
