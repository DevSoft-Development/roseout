import { describe, expect, it } from "vitest";
import { decideOwnerModeAction, SENSITIVE_OWNER_ACTIONS } from "./superadmin-owner-mode-policy";

const base = {
  ownerModeActive: true,
  actorUserId: "staff-1",
  locationId: "location-1",
  nowMs: 10_000,
};
describe("Business Superadmin Owner Mode safety", () => {
  it.each(SENSITIVE_OWNER_ACTIONS)("denies %s without verified elevation", action => {
    expect(decideOwnerModeAction({ ...base, action })).toEqual({
      allowed: false, reason: "owner_mode_sensitive_action",
    });
  });
  it("cannot elevate a different employee, location, or action", () => {
    for (const mismatched of [
      { actorUserId: "other", locationId: "location-1", action: "payments.refund", expiresAtMs: 20_000 },
      { actorUserId: "staff-1", locationId: "other", action: "payments.refund", expiresAtMs: 20_000 },
      { actorUserId: "staff-1", locationId: "location-1", action: "ownership.transfer", expiresAtMs: 20_000 },
      { actorUserId: "staff-1", locationId: "location-1", action: "payments.refund", expiresAtMs: 9_999 },
      { actorUserId: "staff-1", locationId: "location-1", action: "payments.refund", expiresAtMs: 400_001 },
    ]) {
      expect(decideOwnerModeAction({ ...base, action: "payments.refund", serverVerifiedElevation: mismatched }).allowed).toBe(false);
    }
  });
  it("accepts a fresh, server-validated, action-specific elevation", () => {
    expect(decideOwnerModeAction({
      ...base, action: "payments.refund",
      serverVerifiedElevation: { actorUserId: "staff-1", locationId: "location-1", action: "payments.refund", expiresAtMs: 20_000 },
    })).toEqual({ allowed: true, reason: "approved_elevation" });
  });
  it("does not replace existing authorization for ordinary operations", () => {
    expect(decideOwnerModeAction({ ...base, action: "menu.edit" })).toEqual({ allowed: true, reason: "normal_authorization" });
  });
});
