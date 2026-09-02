import "server-only";

import {
  readAdminPayoutsViaCoreApi,
  type CoreAdminPayoutAuditRow,
  type CoreAdminPayoutOwner,
  type CoreAdminPayoutsResponse,
} from "@/lib/aws/core-api";
import {
  readStripeConnectPayoutsViaIntegrationApi,
  type IntegrationBalanceAmount,
  type IntegrationStripeConnectSnapshot,
  type IntegrationStripePayout,
} from "@/lib/aws/integration-api";
import { stripeRequest } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AdminPayoutOwner = CoreAdminPayoutOwner;
export type AdminPayoutAuditRow = CoreAdminPayoutAuditRow;
export type AdminPayoutAccountSnapshot = AdminPayoutOwner & IntegrationStripeConnectSnapshot;
export type AdminPayoutsSnapshot = {
  owners: AdminPayoutOwner[];
  snapshots: AdminPayoutAccountSnapshot[];
  auditRows: AdminPayoutAuditRow[];
};

type StripeBalance = { available?: IntegrationBalanceAmount[]; pending?: IntegrationBalanceAmount[] };
type StripeList<T> = { data?: T[] };

function localOwner(row: Record<string, any>, ownerType: "Location" | "Organizer"): AdminPayoutOwner {
  return {
    ownerType,
    ownerId: String(row.id || ""),
    name: ownerType === "Location"
      ? row.name || row.restaurant_name || row.activity_name || "Location"
      : row.name || "Organizer",
    accountId: String(row.stripe_connect_account_id || ""),
    apiVersion: row.stripe_connect_account_api_version || "v1",
    onboarding: row.stripe_connect_onboarding_status || "unknown",
    payoutsEnabled: Boolean(row.stripe_connect_payouts_enabled),
    chargesEnabled: Boolean(row.stripe_connect_charges_enabled),
    requiresAction: Boolean(row.stripe_connect_requires_action),
    updatedAt: row.stripe_connect_updated_at || null,
  };
}

function localAuditRow(row: Record<string, any>): AdminPayoutAuditRow {
  const object = row.payload?.data?.object && typeof row.payload.data.object === "object"
    ? row.payload.data.object
    : {};
  return {
    id: String(row.id || ""),
    eventType: String(row.event_type || "payout"),
    payoutId: object.id ? String(object.id) : null,
    amount: object.amount == null ? null : Number(object.amount),
    currency: object.currency ? String(object.currency) : null,
    createdAt: row.created_at || null,
    processingError: row.processing_error || null,
    failureMessage: object.failure_message || null,
  };
}

async function localOwnershipSnapshot(): Promise<CoreAdminPayoutsResponse> {
  const [{ data: locations, error: locationError }, { data: organizations, error: organizationError }, { data: payoutLogs, error: payoutLogError }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at").not("stripe_connect_account_id", "is", null).limit(100),
    supabaseAdmin.from("organizations").select("id,name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at").not("stripe_connect_account_id", "is", null).limit(100),
    supabaseAdmin.from("payment_logs").select("id,event_type,payload,created_at,processing_error").like("event_type", "payout.%").order("created_at", { ascending: false }).limit(50),
  ]);
  if (locationError) throw locationError;
  if (organizationError) throw organizationError;

  return {
    success: true,
    owners: [
      ...(locations || []).map((row: Record<string, any>) => localOwner(row, "Location")),
      ...(organizations || []).map((row: Record<string, any>) => localOwner(row, "Organizer")),
    ],
    auditRows: payoutLogError ? [] : (payoutLogs || []).map((row: Record<string, any>) => localAuditRow(row)),
  };
}

async function localStripeSnapshot(accountId: string): Promise<IntegrationStripeConnectSnapshot> {
  try {
    const [balance, payouts] = await Promise.all([
      stripeRequest<StripeBalance>("/balance", { method: "GET", stripeAccount: accountId }),
      stripeRequest<StripeList<IntegrationStripePayout>>("/payouts?limit=10", { method: "GET", stripeAccount: accountId }),
    ]);
    return {
      accountId,
      available: balance.available || [],
      pending: balance.pending || [],
      payouts: payouts.data || [],
      error: null,
    };
  } catch (error) {
    return {
      accountId,
      available: [],
      pending: [],
      payouts: [],
      error: error instanceof Error ? error.message : "Unable to read Stripe account",
    };
  }
}

async function localStripeSnapshots(accountIds: string[]) {
  const results = new Array<IntegrationStripeConnectSnapshot>(accountIds.length);
  let cursor = 0;
  const workerCount = Math.min(4, accountIds.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= accountIds.length) return;
      results[index] = await localStripeSnapshot(accountIds[index]);
    }
  }));
  return results;
}

export async function readAdminPayoutsSnapshot(): Promise<AdminPayoutsSnapshot> {
  let ownership: CoreAdminPayoutsResponse;
  try {
    ownership = await readAdminPayoutsViaCoreApi();
  } catch (error) {
    console.warn("[admin-payouts] Core API unavailable; using local Supabase fallback", error);
    ownership = await localOwnershipSnapshot();
  }

  const accountIds = Array.from(new Set(ownership.owners.map((owner) => owner.accountId).filter(Boolean)));
  let financials: IntegrationStripeConnectSnapshot[];
  try {
    const response = await readStripeConnectPayoutsViaIntegrationApi(accountIds);
    financials = response.snapshots;
  } catch (error) {
    console.warn("[admin-payouts] Integration API unavailable; using local Stripe fallback", error);
    financials = await localStripeSnapshots(accountIds);
  }

  const byAccount = new Map(financials.map((snapshot) => [snapshot.accountId, snapshot]));
  const snapshots = ownership.owners.map((owner) => {
    const financial = byAccount.get(owner.accountId) || {
      accountId: owner.accountId,
      available: [],
      pending: [],
      payouts: [],
      error: "Stripe account snapshot unavailable",
    };
    return { ...owner, ...financial };
  });

  return {
    owners: ownership.owners,
    snapshots,
    auditRows: ownership.auditRows,
  };
}
