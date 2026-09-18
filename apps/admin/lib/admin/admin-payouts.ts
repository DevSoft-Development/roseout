import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  readStripeConnectPayoutsViaIntegrationApi,
  type IntegrationBalanceAmount,
  type IntegrationStripeConnectSnapshot,
  type IntegrationStripePayout,
} from "@/lib/aws/integration-api";

export type AdminPayoutOwner = {
  ownerType: "Location" | "Organizer";
  ownerId: string;
  name: string;
  accountId: string;
  apiVersion: string;
  onboarding: string;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  requiresAction: boolean;
  updatedAt: string | null;
};

export type AdminPayoutAuditRow = {
  id: string;
  eventType: string;
  payoutId: string | null;
  amount: number | null;
  currency: string | null;
  createdAt: string | null;
  processingError: string | null;
  failureMessage: string | null;
};

export type AdminPayoutAccountSnapshot =
  AdminPayoutOwner & IntegrationStripeConnectSnapshot;

export type AdminPayoutsSnapshot = {
  owners: AdminPayoutOwner[];
  snapshots: AdminPayoutAccountSnapshot[];
  auditRows: AdminPayoutAuditRow[];
};

function owner(
  row: Record<string, any>,
  ownerType: AdminPayoutOwner["ownerType"],
): AdminPayoutOwner {
  return {
    ownerType,
    ownerId: String(row.id || ""),
    name:
      ownerType === "Location"
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

function auditRow(row: Record<string, any>): AdminPayoutAuditRow {
  const object =
    row.payload?.data?.object && typeof row.payload.data.object === "object"
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

export async function readAdminPayoutsSnapshot(): Promise<AdminPayoutsSnapshot> {
  const adminDb = getAdminDatabaseClient();
  const [
    { data: locations, error: locationError },
    { data: organizations, error: organizationError },
    { data: payoutLogs, error: payoutLogError },
  ] = await Promise.all([
    adminDb
      .from("locations")
      .select(
        "id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at",
      )
      .not("stripe_connect_account_id", "is", null)
      .limit(100),
    adminDb
      .from("organizations")
      .select(
        "id,name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at",
      )
      .not("stripe_connect_account_id", "is", null)
      .limit(100),
    adminDb
      .from("payment_logs")
      .select("id,event_type,payload,created_at,processing_error")
      .like("event_type", "payout.%")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (locationError) throw locationError;
  if (organizationError) throw organizationError;

  const owners: AdminPayoutOwner[] = [
    ...(locations || []).map((row: Record<string, any>) =>
      owner(row, "Location"),
    ),
    ...(organizations || []).map((row: Record<string, any>) =>
      owner(row, "Organizer"),
    ),
  ];

  const accountIds = Array.from(
    new Set(owners.map((item) => item.accountId).filter(Boolean)),
  );

  let financials: IntegrationStripeConnectSnapshot[] = [];
  if (accountIds.length) {
    try {
      financials = (
        await readStripeConnectPayoutsViaIntegrationApi(accountIds)
      ).snapshots;
    } catch (error) {
      console.warn(
        "[admin-payouts] Stripe Connect integration unavailable",
        error,
      );
      financials = accountIds.map((accountId) => ({
        accountId,
        available: [] as IntegrationBalanceAmount[],
        pending: [] as IntegrationBalanceAmount[],
        payouts: [] as IntegrationStripePayout[],
        error: "Stripe account snapshot unavailable",
      }));
    }
  }

  const byAccount = new Map(
    financials.map((snapshot) => [snapshot.accountId, snapshot]),
  );

  return {
    owners,
    snapshots: owners.map((item) => ({
      ...item,
      ...(byAccount.get(item.accountId) || {
        accountId: item.accountId,
        available: [],
        pending: [],
        payouts: [],
        error: "Stripe account snapshot unavailable",
      }),
    })),
    auditRows: payoutLogError
      ? []
      : (payoutLogs || []).map((row: Record<string, any>) => auditRow(row)),
  };
}
