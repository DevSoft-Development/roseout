import "server-only";

import {
  readAdminBillingViaCoreApi,
  type CoreAdminBillingMetrics,
  type CoreAdminBillingResponse,
} from "@/lib/aws/core-api";
import { BUSINESS_PRO_MONTHLY_CENTS, isBusinessProPlan } from "@/lib/billing/plans";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminBillingRow = Record<string, any> & { id: string };
export type AdminBillingSnapshot = Omit<CoreAdminBillingResponse, "success" | "upcomingRows" | "pastDueRows" | "recentEvents" | "trialRows"> & {
  upcomingRows: AdminBillingRow[];
  pastDueRows: AdminBillingRow[];
  recentEvents: AdminBillingRow[];
  trialRows: AdminBillingRow[];
};

const LOCATION_SELECT = "id,name,restaurant_name,activity_name,owner_email,claimed_by_email,subscription_plan,subscription_status,subscription_amount_cents,subscription_interval,next_billing_date,current_period_end,trial_ends_at,stripe_customer_id,stripe_subscription_id,last_payment_failed_at,billing_grace_ends_at,canceled_at,created_at";

function amount(row: AdminBillingRow) {
  return Number(
    row.subscription_amount_cents
      || (isBusinessProPlan(row.subscription_plan) && row.subscription_status === "active" ? BUSINESS_PRO_MONTHLY_CENTS : 0),
  );
}

function objectId(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id?: unknown }).id || "") || null;
  return null;
}

function normalizePaymentEvent(row: AdminBillingRow): AdminBillingRow {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const object = payload?.data?.object && typeof payload.data.object === "object" ? payload.data.object : {};
  const metadata = object?.metadata && typeof object.metadata === "object" ? object.metadata : {};
  const eventType = String(row.event_type || "");
  const invoiceId = eventType.startsWith("invoice.") ? objectId(object.id) : objectId(object.invoice);
  const amountPaid = object.amount_paid ?? object.amount_total ?? object.amount_received ?? 0;

  return {
    id: row.id,
    event_type: eventType,
    stripe_event_id: row.stripe_event_id || null,
    stripe_customer_id: objectId(object.customer),
    stripe_subscription_id: objectId(object.subscription),
    stripe_invoice_id: invoiceId || objectId(object.invoice),
    location_id: row.location_id || metadata.location_id || null,
    amount_paid_cents: Number(amountPaid || 0),
    amount_due_cents: Number(object.amount_due || 0),
    currency: object.currency || null,
    status: object.status || null,
    created_at: row.created_at || null,
    processing_error: row.processing_error || null,
  };
}

async function localAdminBillingSnapshot(): Promise<AdminBillingSnapshot> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const seven = new Date(now.getTime() + 7 * 86400000);
  const thirty = new Date(now.getTime() + 30 * 86400000);

  const [{ data, error }, logsResult] = await Promise.all([
    supabaseAdmin.from("locations").select(LOCATION_SELECT).limit(1000),
    supabaseAdmin
      .from("payment_logs")
      .select("id,event_type,stripe_event_id,location_id,payload,created_at,processing_error")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const locations = error ? [] as AdminBillingRow[] : (data || []) as unknown as AdminBillingRow[];
  const logs = logsResult.error
    ? [] as AdminBillingRow[]
    : ((logsResult.data || []) as unknown as AdminBillingRow[]).map(normalizePaymentEvent);

  const activePaid = locations.filter((row) =>
    ["active", "grace_period", "comped"].includes(String(row.subscription_status || ""))
      && isBusinessProPlan(row.subscription_plan),
  );
  const trialing = locations.filter((row) => row.subscription_status === "trialing");
  const pastDue = locations.filter((row) => ["past_due", "unpaid"].includes(String(row.subscription_status || "")));
  const canceledThisMonth = locations.filter((row) => row.canceled_at && new Date(row.canceled_at) >= monthStart);
  const mrrCents = activePaid.reduce((sum, row) => {
    const value = amount(row);
    return sum + (["year", "annual"].includes(String(row.subscription_interval || "")) ? Math.round(value / 12) : value);
  }, 0);
  const collectedThisMonth = logs
    .filter((row) => row.event_type === "invoice.payment_succeeded" && row.created_at && new Date(row.created_at) >= monthStart)
    .reduce((sum, row) => sum + Number(row.amount_paid_cents || 0), 0);

  const upcoming = (cutoff: Date) => locations.filter((row) => {
    if (!row.next_billing_date) return false;
    const date = new Date(row.next_billing_date);
    return date >= now && date <= cutoff;
  });
  const upcomingRows = upcoming(thirty)
    .sort((a, b) => new Date(a.next_billing_date).getTime() - new Date(b.next_billing_date).getTime())
    .slice(0, 20);
  const trialRows = trialing
    .filter((row) => row.trial_ends_at && new Date(row.trial_ends_at) <= thirty)
    .slice(0, 20);

  const metrics: CoreAdminBillingMetrics = {
    activePaidLocations: activePaid.length,
    trialingLocations: trialing.length,
    pastDueLocations: pastDue.length,
    canceledThisMonth: canceledThisMonth.length,
    mrrCents,
    arrCents: mrrCents * 12,
    collectedThisMonthCents: collectedThisMonth,
    upcoming7d: upcoming(seven).length,
    upcoming30d: upcomingRows.length,
    pastDueEstimatedCents: pastDue.reduce((sum, row) => sum + amount(row), 0),
  };

  return {
    sourceError: Boolean(error),
    metrics,
    upcomingRows,
    pastDueRows: pastDue,
    recentEvents: logs.slice(0, 20),
    trialRows,
  };
}

export async function readAdminBillingSnapshot(): Promise<AdminBillingSnapshot> {
  try {
    const response = await readAdminBillingViaCoreApi();
    return {
      sourceError: response.sourceError,
      metrics: response.metrics,
      upcomingRows: response.upcomingRows as AdminBillingRow[],
      pastDueRows: response.pastDueRows as AdminBillingRow[],
      recentEvents: response.recentEvents as AdminBillingRow[],
      trialRows: response.trialRows as AdminBillingRow[],
    };
  } catch (error) {
    console.warn("[admin-billing] Core API unavailable; using local Supabase fallback", error);
    return localAdminBillingSnapshot();
  }
}
