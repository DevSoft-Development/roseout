import "server-only";

import { isClaimedLocation } from "@/lib/location-intelligence/source-precedence";
import type { LocationMaintenanceMode } from "@/lib/location-intelligence/v2/contracts";

export const MATERIAL_CHANGE_TYPES = new Set([
  "temporarily_closed",
  "permanently_closed",
  "moved",
  "renamed",
  "reopened",
  "replaced",
  "duplicate",
  "identity_conflict",
]);

export function maintenanceModeForLocation(location: Record<string, unknown>): LocationMaintenanceMode {
  return isClaimedLocation(location) ? "owner_maintained" : "theouthaven_managed";
}

export function allowRoutinePaidProfileEnrichment(location: Record<string, unknown>) {
  // V2 policy: deep enrichment is a bootstrap operation, never a routine refresh.
  // Claimed locations are owner-maintained and are always excluded.
  return false;
}

export function allowPaidMaterialChangeVerification(input: {
  location: Record<string, unknown>;
  changeType: string;
  confidence: number;
}) {
  if (!MATERIAL_CHANGE_TYPES.has(input.changeType)) return false;
  if (input.confidence < 0.5) return false;
  // Claimed locations may still receive targeted integrity verification for material changes.
  return true;
}

export function reviewRefreshCadenceDays(popularityScore: number) {
  if (popularityScore >= 90) return 30;
  if (popularityScore >= 70) return 60;
  if (popularityScore >= 40) return 90;
  if (popularityScore >= 10) return 180;
  return null;
}
