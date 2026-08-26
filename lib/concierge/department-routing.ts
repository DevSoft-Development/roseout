export type ConciergeDepartment = "concierge" | "reservations" | "support";

const RESERVATION_INTENT = /\b(reservation|waitlist)\b|\b(cancel|change|move|reschedule|modify)\b.{0,40}\b(reservation|table|party\s*size)\b|\bmy\s+booking\b.{0,40}\b(cancel|change|move|reschedule|modify|confirmation|details)\b/i;

const SUPPORT_INTENT = /\b(password|passcode|log\s*in|login|sign\s*in|signin|account\s+access|reset\s+(?:my\s+)?password|forgot\s+(?:my\s+)?password|verification\s+code|authentication\s+code|locked\s+out|billing|subscription|invoice|refund|chargeback|charged|technical\s+(?:issue|problem)|support\s+(?:agent|team)|customer\s+support)\b/i;

export function classifyConciergeDepartment(message: string): ConciergeDepartment {
  const text = String(message || "").trim();
  if (!text) return "concierge";
  if (RESERVATION_INTENT.test(text)) return "reservations";
  if (SUPPORT_INTENT.test(text)) return "support";
  return "concierge";
}
