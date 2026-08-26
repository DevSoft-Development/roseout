export type SupportTopic =
  | "account"
  | "business_claim"
  | "billing"
  | "reservations"
  | "events_experiences"
  | "website"
  | "menu_packages"
  | "business_profile"
  | "qr_codes"
  | "marketing_growth"
  | "reviews_feedback"
  | "analytics"
  | "search_outings"
  | "technical";

const TOPIC_PATTERNS: Array<[SupportTopic, RegExp]> = [
  ["account", /\b(account\s+access|account\s+login|login|log\s*in|sign\s*in|signin|password|passcode|locked\s+out|verification\s+code|authentication\s+code|forgot\s+(?:my\s+)?password|reset\s+(?:my\s+)?password|change\s+(?:my\s+)?password|can(?:not|'?t)\s+access\s+(?:my\s+)?account|change\s+my\s+(?:email|phone))\b/i],
  ["business_claim", /\b(claim|claiming|claimed|owner\s+verification|ownership\s+verification|ownership\s+review|wrong\s+owner|ownership\s+dispute)\b/i],
  ["billing", /\b(billing|plan|subscription|checkout|invoice|refund|chargeback|charged|payment\s+method|credit\s+card)\b/i],
  ["reservations", /\b(reservation|booking|waitlist|table|seated|party\s*size|check\s*in)\b/i],
  ["events_experiences", /\b(event|ticket|attendee|experience|slot|availability)\b/i],
  ["website", /\b(website|domain|publish|hosting|dns|subdomain)\b/i],
  ["menu_packages", /\b(menu|package|item|price|pdf)\b/i],
  ["business_profile", /\b(profile|hours|photo|logo|branding|listing|address|business\s+phone|category)\b/i],
  ["qr_codes", /\b(qr|scan|claim\s+code)\b/i],
  ["marketing_growth", /\b(offer|vip|lead|promotion|marketing|campaign|sms\s+credit)\b/i],
  ["reviews_feedback", /\b(review|feedback|rating)\b/i],
  ["analytics", /\b(analytics|metric|scan\s+count|conversion)\b/i],
  ["search_outings", /\b(search|outing|result|recommendation|explore|date\s+night|night\s+out)\b/i],
  ["technical", /\b(technical\s+(?:issue|problem)|bug|error|not\s+working|broken|page\s+won'?t\s+load|app\s+won'?t\s+load)\b/i],
];

export function inferExplicitSupportTopic(value: string): SupportTopic | null {
  const text = String(value || "").trim();
  if (!text) return null;
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    if (pattern.test(text)) return topic;
  }
  return null;
}

export function supportCategoryForTopic(topic: SupportTopic | null) {
  switch (topic) {
    case "account": return "Account";
    case "business_claim": return "Business Claim";
    case "billing": return "Billing & Plan";
    case "reservations": return "Reservations";
    case "events_experiences": return "Events & Experiences";
    case "website": return "Website";
    case "menu_packages": return "Menu / Packages";
    case "business_profile": return "Business Profile";
    case "qr_codes": return "QR Codes";
    case "marketing_growth": return "Marketing & Growth";
    case "reviews_feedback": return "Reviews & Feedback";
    case "analytics": return "Analytics";
    case "search_outings": return "Search & Outings";
    case "technical": return "Technical Support";
    default: return "General Support";
  }
}

export function inferSupportCategory(value: string) {
  return supportCategoryForTopic(inferExplicitSupportTopic(value));
}

export function scopeSupportTextContext(messages: string[], latestMessage: string) {
  const clean = messages.map((item) => String(item || "").trim()).filter(Boolean);
  const latest = String(latestMessage || "").trim();
  const latestTopic = inferExplicitSupportTopic(latest);

  if (!latestTopic) {
    const combined = [...clean, latest].filter(Boolean);
    return combined.slice(-6);
  }

  const deduped = clean.length && latest && clean[clean.length - 1].toLowerCase() === latest.toLowerCase()
    ? clean.slice(0, -1)
    : clean;
  const selected: string[] = [];

  for (let index = deduped.length - 1; index >= 0; index -= 1) {
    const message = deduped[index];
    const topic = inferExplicitSupportTopic(message);
    if (topic && topic !== latestTopic) break;
    selected.unshift(message);
  }

  selected.push(latest);
  return selected.slice(-6);
}

export function didSupportTopicChange(previousMessages: string[], latestMessage: string) {
  const latestTopic = inferExplicitSupportTopic(latestMessage);
  if (!latestTopic) return false;
  for (let index = previousMessages.length - 1; index >= 0; index -= 1) {
    const priorTopic = inferExplicitSupportTopic(previousMessages[index]);
    if (!priorTopic) continue;
    return priorTopic !== latestTopic;
  }
  return false;
}
