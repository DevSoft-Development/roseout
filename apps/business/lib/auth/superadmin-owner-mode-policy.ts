/**
 * Explicit permission contract for actions performed while an internal
 * Superadmin is viewing a location in Business Owner Mode.
 * A location-owner session never inherits the real owner's payment authority.
 */
export const SENSITIVE_OWNER_ACTIONS = [
  "payments.refund", "payments.capture", "payments.payout",
  "payments.change_destination", "ownership.transfer",
  "security.change_credentials", "subscription.cancel",
] as const;
export type SensitiveOwnerAction = typeof SENSITIVE_OWNER_ACTIONS[number];
export type OwnerModeDecision =
  | { allowed: true; reason: "normal_authorization" | "approved_elevation" }
  | { allowed: false; reason: "owner_mode_sensitive_action" | "elevation_invalid" };

/**
 * An elevation must be validated server-side, bound to the acting user,
 * location, action and an unexpired challenge (preferably fresh Entra MFA).
 * Merely presenting a client-provided boolean never qualifies.
 */
export function decideOwnerModeAction(input: {
  ownerModeActive: boolean;
  action: string;
  serverVerifiedElevation?: {
    actorUserId: string; locationId: string; action: string; expiresAtMs: number;
  } | null;
  actorUserId: string;
  locationId: string;
  nowMs: number;
}): OwnerModeDecision {
  if (!input.ownerModeActive || !(SENSITIVE_OWNER_ACTIONS as readonly string[]).includes(input.action))
    return { allowed: true, reason: "normal_authorization" };
  const verified = input.serverVerifiedElevation;
  if (!verified) return { allowed: false, reason: "owner_mode_sensitive_action" };
  const valid = verified.actorUserId === input.actorUserId &&
    verified.locationId === input.locationId &&
    verified.action === input.action &&
    Number.isFinite(verified.expiresAtMs) &&
    verified.expiresAtMs > input.nowMs &&
    verified.expiresAtMs - input.nowMs <= 5 * 60_000;
  return valid
    ? { allowed: true, reason: "approved_elevation" }
    : { allowed: false, reason: "elevation_invalid" };
}
