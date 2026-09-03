import "server-only";
import type { CommunicationType, ConsentStatus, DeliveryDecision } from "./types";
const EXPLICIT_CONSENT = new Set<CommunicationType>(["marketing", "sales", "renewal"]);
export function evaluateDelivery(input: { communicationType: CommunicationType; consent: ConsentStatus; suppressed: boolean; quietHours?: boolean }): DeliveryDecision {
  if (input.suppressed) return { allowed: false, code: "suppressed", reason: "An active suppression applies to this destination." };
  if (input.consent === "denied") return { allowed: false, code: "consent_denied", reason: "The contact denied this communication type." };
  if (EXPLICIT_CONSENT.has(input.communicationType) && input.consent !== "granted") return { allowed: false, code: "consent_unknown", reason: "Explicit consent is required for this communication type." };
  if (input.quietHours && input.communicationType !== "transactional") return { allowed: false, code: "quiet_hours", reason: "Delivery is deferred until quiet hours end." };
  return { allowed: true, code: "allowed", reason: "Consent and suppression checks passed." };
}
export function isQuietHours(now: Date, timeZone: string, startHour = 21, endHour = 8) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}
