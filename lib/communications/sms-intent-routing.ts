export type SmsDepartment = "concierge" | "reservations" | "support";

const CONTINUATION_ONLY = /^(?:yes|y|yeah|yep|yea|no|n|nope|nah|ok|okay|sure|thanks|thank you|thx|skip|later|maybe later|\d{1,2})[.! ]*$/i;

const ACCOUNT_SUPPORT = /\b(password|passcode|log\s*in|login|sign\s*in|signin|account\s+access|account\s+login|reset\s+(?:my\s+)?password|forgot\s+(?:my\s+)?password|change\s+(?:my\s+)?password|verification\s+code|authentication\s+code|locked\s+out|can(?:not|'?t)\s+access\s+(?:my\s+)?account|can(?:not|'?t)\s+get\s+into\s+(?:my\s+)?account|missing\s+dashboard\s+access)\b/i;
const PROTECTED_SUPPORT = /\b(billing|subscription|invoice|refund|chargeback|charged|unauthorized\s+(?:charge|access)|fraud|technical\s+(?:issue|problem)|support\s+(?:agent|team)|customer\s+support|speak\s+to\s+(?:a\s+)?(?:human|person|agent)|delete\s+my\s+account|close\s+my\s+account|change\s+my\s+(?:email|phone))\b/i;
const CLAIM_SUPPORT = /\b(claim|claiming|claimed|ownership\s+verification|owner\s+verification)\b.{0,60}\b(business|restaurant|bar|venue|location|profile|listing)\b|\b(business|restaurant|bar|venue|location|profile|listing)\b.{0,60}\b(claim|claiming|claimed|ownership\s+verification|owner\s+verification)\b/i;

const RESERVATION_INTENT = /\b(reservation|waitlist)\b|\b(cancel|change|move|reschedule|modify)\b.{0,50}\b(reservation|booking|table|party\s*size)\b|\bmy\s+booking\b.{0,50}\b(cancel|change|move|reschedule|modify|confirmation|details)\b|\b(reservation|booking)\s+(?:confirmation|details)\b/i;

const CONCIERGE_DIRECT = /\b(directions?|how\s+do\s+i\s+get\s+to|where\s+is|what(?:'s|\s+is)\s+the\s+address)\b/i;
const CONCIERGE_PLACE_INFO = /\b(hours?|open|close|closing|address|phone\s+number|website)\b.{0,55}\b(restaurant|activity|place|location|venue|stop)\b|\b(restaurant|activity|place|location|venue|stop)\b.{0,55}\b(hours?|open|close|closing|address|phone\s+number|website)\b/i;
const CONCIERGE_PLANNING = /\b(plan|find|recommend|suggest|show\s+me|looking\s+for)\b.{0,70}\b(outing|date\s+night|night\s+out|restaurant|activity|place|things?\s+to\s+do|brunch|dinner|drinks?)\b|\b(date\s+night|girls?\s+night|night\s+out|things?\s+to\s+do|my\s+outing|my\s+plan)\b/i;
const CONCIERGE_REPLAN = /\b(replan|replace|swap|change)\b.{0,50}\b(restaurant|activity|stop|outing|plan)\b/i;

export function isShortSmsContinuation(message: string) {
  const text = String(message || "").trim();
  return Boolean(text && CONTINUATION_ONLY.test(text));
}

/**
 * Returns only strong, self-contained department intent. Short replies and
 * ambiguous fragments intentionally return null so an active flow can keep
 * ownership of YES/NO, ratings, dates, neighborhood names, and similar replies.
 */
export function classifySmsDepartment(message: string): SmsDepartment | null {
  const text = String(message || "").trim();
  if (!text || isShortSmsContinuation(text) || /^help$/i.test(text)) return null;

  if (ACCOUNT_SUPPORT.test(text)) return "support";
  if (RESERVATION_INTENT.test(text)) return "reservations";
  if (PROTECTED_SUPPORT.test(text) || CLAIM_SUPPORT.test(text)) return "support";
  if (CONCIERGE_DIRECT.test(text) || CONCIERGE_PLACE_INFO.test(text) || CONCIERGE_PLANNING.test(text) || CONCIERGE_REPLAN.test(text)) return "concierge";

  return null;
}

export function shouldSwitchSmsDepartment(message: string, current: SmsDepartment) {
  const target = classifySmsDepartment(message);
  return target && target !== current ? target : null;
}
