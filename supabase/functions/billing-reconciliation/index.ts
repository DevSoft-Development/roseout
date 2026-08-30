import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";
const supabaseUrl = (
  Deno.env.get("UPSTREAM_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || ""
).replace(/\/+$/, "");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

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
  items?: {
    data?: Array<{
      price?: {
        id?: string;
        unit_amount?: number | null;
        currency?: string | null;
        recurring?: { interval?: string | null };
      };
    }>;
  };
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const supplied = request.headers.get("x-worker-secret") ??
    request.headers.get("x-internal-worker-secret") ?? "";
  if (!secureCompare(supplied, workerSecret)) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }
  if (!workerSecret) {
    return json({ success: false, error: "WORKER_INTERNAL_SECRET is not configured" }, 500);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "Supabase runtime credentials are not configured" }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body.limit || 100), 250));
  const startedAt = Date.now();
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: locations, error: readError } = await supabase
    .from("locations")
    .select(
      "id,subscription_plan,subscription_status,stripe_customer_id,stripe_subscription_id,current_period_start,current_period_end,next_billing_date,trial_ends_at,cancel_at_period_end,canceled_at,stripe_price_id,subscription_interval,subscription_amount_cents,subscription_currency,past_due_at,billing_grace_ends_at",
    )
    .not("stripe_subscription_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (readError) {
    return json({
      success: false,
      error: `Unable to read billing locations: ${readError.message}`,
      durationMs: Date.now() - startedAt,
    }, 500);
  }

  let scanned = 0;
  let updated = 0;
  let drifted = 0;
  let failed = 0;
  const failures: Array<{ locationId: string; message: string }> = [];

  for (const location of locations ?? []) {
    scanned += 1;
    const subscriptionId = String(location.stripe_subscription_id || "").trim();
    if (!subscriptionId) continue;

    try {
      const subscription = await fetchStripeSubscription(subscriptionId);
      const stripeStatus = normalizeBillingStatus(subscription.status);
      const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id || null;
      const price = subscription.items?.data?.[0]?.price || {};

      let effectiveStatus = stripeStatus;
      let pastDueAt = location.past_due_at || null;
      let graceEndsAt = location.billing_grace_ends_at || null;

      if (stripeStatus === "past_due") {
        const firstFailure = pastDueAt ? new Date(pastDueAt) : now;
        pastDueAt = pastDueAt || firstFailure.toISOString();
        graceEndsAt = graceEndsAt || addDays(firstFailure, 14);
        effectiveStatus = new Date(graceEndsAt).getTime() > now.getTime()
          ? "grace_period"
          : "past_due";
      } else if (["active", "trialing"].includes(stripeStatus)) {
        pastDueAt = null;
        graceEndsAt = null;
      } else if (["canceled", "incomplete_expired"].includes(stripeStatus)) {
        graceEndsAt = null;
      }

      const nextPlan = ["canceled", "incomplete_expired"].includes(stripeStatus)
        ? "free_discovery"
        : "business_pro";

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

      const { error: updateError } = await supabase
        .from("locations")
        .update(patch)
        .eq("id", location.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      failed += 1;
      failures.push({
        locationId: String(location.id),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const { data: expiredGrace, error: expiredError } = await supabase
    .from("locations")
    .select("id")
    .eq("subscription_status", "grace_period")
    .not("billing_grace_ends_at", "is", null)
    .lte("billing_grace_ends_at", nowIso)
    .limit(250);

  let graceExpired = 0;
  if (!expiredError && expiredGrace?.length) {
    const ids = expiredGrace.map((row) => row.id);
    const { error } = await supabase
      .from("locations")
      .update({ subscription_status: "past_due", updated_at: nowIso })
      .in("id", ids);
    if (!error) graceExpired = ids.length;
  }

  console.log("billing-reconciliation completed", {
    source: "aws_edge_runtime",
    scanned,
    updated,
    drifted,
    graceExpired,
    failed,
    durationMs: Date.now() - startedAt,
  });

  return json({
    success: failed === 0,
    source: "aws_edge_runtime",
    scanned,
    updated,
    drifted,
    graceExpired,
    failed,
    failures: failures.slice(0, 10),
    durationMs: Date.now() - startedAt,
  }, failed === scanned && scanned > 0 ? 500 : 200);
});

async function fetchStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
      },
    },
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && typeof payload === "object" &&
        "error" in payload && payload.error && typeof payload.error === "object" &&
        "message" in payload.error
      ? String(payload.error.message)
      : "Stripe request failed";
    throw new Error(message);
  }

  return payload as StripeSubscription;
}

function normalizeBillingStatus(value?: string | null): string {
  const clean = String(value || "").trim().toLowerCase();
  if (["active_partner", "paid", "current"].includes(clean)) return "active";
  if (clean === "cancelled") return "canceled";
  if ([
    "inactive",
    "trialing",
    "active",
    "past_due",
    "grace_period",
    "canceled",
    "comped",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
  ].includes(clean)) {
    return clean;
  }
  return "inactive";
}

function toIso(seconds?: number | null): string | null {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

function addDays(value: Date, days: number): string {
  return new Date(value.getTime() + days * 86_400_000).toISOString();
}

function secureCompare(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
