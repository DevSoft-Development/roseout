import "server-only";

import { stripeRequest, stripeV2Request } from "@/lib/stripe/server";

export type ConnectAccountState = {
  ready: boolean;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  onboardingStatus: "complete" | "restricted" | "pending";
  requiresAction: boolean;
  currentlyDueCount: number;
  pastDueCount: number;
  futureDueCount: number;
  requirementsDeadline: string | null;
  disabledReason: string | null;
  statusDetails: unknown[];
};

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function deadlineToIso(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

export function normalizeV2ConnectAccount(account: any): ConnectAccountState {
  const merchant = account?.configuration?.merchant || {};
  const cardCapability = merchant?.capabilities?.card_payments || {};
  const payoutCapability = merchant?.capabilities?.stripe_balance?.payouts || {};
  const requirements = account?.requirements || {};
  const futureRequirements = account?.future_requirements || {};

  const cardStatus = String(cardCapability?.status || "inactive");
  const payoutStatus = String(payoutCapability?.status || "inactive");
  const chargesEnabled = cardStatus === "active";
  const payoutsEnabled = payoutStatus === "active";
  const ready = chargesEnabled && payoutsEnabled;

  const currentlyDue = list(requirements.currently_due);
  const pastDue = list(requirements.past_due);
  const pendingVerification = list(requirements.pending_verification);
  const futureDue = list(futureRequirements.currently_due).length
    ? list(futureRequirements.currently_due)
    : list(futureRequirements.eventually_due);

  const disabledReason = String(
    requirements.disabled_reason ||
      futureRequirements.disabled_reason ||
      "",
  ).trim() || null;

  const statusDetails = [
    ...list(cardCapability.status_details),
    ...list(payoutCapability.status_details),
  ];

  const requiresAction = Boolean(
    currentlyDue.length ||
      pastDue.length ||
      disabledReason ||
      cardStatus === "restricted" ||
      payoutStatus === "restricted",
  );

  const detailsSubmitted = currentlyDue.length === 0 && pendingVerification.length === 0;

  return {
    ready,
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    onboardingStatus: ready ? "complete" : requiresAction ? "restricted" : "pending",
    requiresAction,
    currentlyDueCount: currentlyDue.length,
    pastDueCount: pastDue.length,
    futureDueCount: futureDue.length,
    requirementsDeadline: deadlineToIso(requirements.current_deadline || futureRequirements.current_deadline),
    disabledReason,
    statusDetails,
  };
}

export function normalizeV1ConnectAccount(account: any): ConnectAccountState {
  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const ready = Boolean(account?.details_submitted && chargesEnabled && payoutsEnabled);
  const requirements = account?.requirements || {};
  const futureRequirements = account?.future_requirements || {};
  const currentlyDue = list(requirements.currently_due);
  const pastDue = list(requirements.past_due);
  const futureDue = list(futureRequirements.currently_due).length
    ? list(futureRequirements.currently_due)
    : list(futureRequirements.eventually_due);
  const disabledReason = String(requirements.disabled_reason || "").trim() || null;
  const requiresAction = Boolean(currentlyDue.length || pastDue.length || disabledReason);

  return {
    ready,
    detailsSubmitted: Boolean(account?.details_submitted),
    chargesEnabled,
    payoutsEnabled,
    onboardingStatus: ready ? "complete" : requiresAction || account?.details_submitted ? "restricted" : "pending",
    requiresAction,
    currentlyDueCount: currentlyDue.length,
    pastDueCount: pastDue.length,
    futureDueCount: futureDue.length,
    requirementsDeadline: deadlineToIso(requirements.current_deadline || futureRequirements.current_deadline),
    disabledReason,
    statusDetails: list(requirements.errors),
  };
}

export async function retrieveConnectAccountState(accountId: string, apiVersion: string): Promise<ConnectAccountState> {
  if (apiVersion === "v2") {
    const query = new URLSearchParams();
    query.append("include[0]", "configuration.merchant");
    query.append("include[1]", "requirements");
    query.append("include[2]", "future_requirements");
    const account = await stripeV2Request<any>(`/core/accounts/${encodeURIComponent(accountId)}?${query.toString()}`, { method: "GET" });
    return normalizeV2ConnectAccount(account);
  }

  const account = await stripeRequest<any>(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
  return normalizeV1ConnectAccount(account);
}

export function connectStateUpdate(state: ConnectAccountState) {
  return {
    stripe_connect_onboarding_status: state.onboardingStatus,
    stripe_connect_details_submitted: state.detailsSubmitted,
    stripe_connect_charges_enabled: state.chargesEnabled,
    stripe_connect_payouts_enabled: state.payoutsEnabled,
    stripe_connect_requires_action: state.requiresAction,
    stripe_connect_currently_due_count: state.currentlyDueCount,
    stripe_connect_past_due_count: state.pastDueCount,
    stripe_connect_future_due_count: state.futureDueCount,
    stripe_connect_requirements_deadline: state.requirementsDeadline,
    stripe_connect_disabled_reason: state.disabledReason,
    stripe_connect_status_details: state.statusDetails,
    stripe_connect_updated_at: new Date().toISOString(),
  };
}
