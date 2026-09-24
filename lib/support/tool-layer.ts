import { cleanSearchTerm, rankOnboardingLocation, toOnboardingLocation, type OnboardingLocation } from "@/lib/locations/onboarding";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSupportIdentityGateDecision } from "@/lib/support/identity-verification";
import { inferExplicitSupportTopic } from "@/lib/support/topic-context";

export type SupportToolDecision = {
  message: string;
  reason: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  subject?: string;
  resolved?: boolean;
  metadata?: Record<string, unknown>;
};

type ConversationMessage = {
  body: string | null;
  direction: string | null;
  created_at: string | null;
};

const CLAIM_CONTEXT = /\b(claim|claiming|claimed|owner verification|ownership)\b/i;
const CLAIM_SEARCH = /\b(?:search|find|look up|lookup)\b.*\b(?:location|business|restaurant|bar|venue|listing|profile)\b/i;
const ACCOUNT_ACCESS = /\b(password|passcode|log\s*in|login|sign\s*in|signin|account\s+access|reset\s+(?:my\s+)?password|forgot\s+(?:my\s+)?password|change\s+(?:my\s+)?password|locked\s+out)\b/i;
const PASSWORD_REQUEST = /\b(password|reset\s+(?:my\s+)?password|forgot\s+(?:my\s+)?password|change\s+(?:my\s+)?password)\b/i;
const NEGATED_RESOLUTION = /\b(but|still|however|not working|didn'?t work|doesn'?t work|issue|problem)\b/i;
const RESOLUTION_SIGNAL = /\b(all set|that worked|it worked|that works|it works|fixed now|that fixed it|solved|resolved|got it working|works now|thank you.*worked|thanks.*worked)\b/i;

function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

export function isResolutionMessage(value: string) {
  const text = normalize(value);
  if (!text || NEGATED_RESOLUTION.test(text)) return false;
  return RESOLUTION_SIGNAL.test(text) || /^(ok(?:ay)?[,.! ]*)?(thanks|thank you|thx)[!. ]*$/i.test(text);
}

export function compactSmsMessage(value: string, max = 300) {
  const message = value.replace(/\s+/g, " ").trim();
  if (message.length <= max) return message;

  const sentences = message.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) || [message];
  const question = [...sentences].reverse().find((part) => part.endsWith("?"));
  const selected: string[] = [];
  let used = 0;
  for (const sentence of sentences) {
    if (sentence === question) continue;
    const next = used + sentence.length + (selected.length ? 1 : 0);
    if (next > Math.max(170, max - (question ? Math.min(question.length + 1, 120) : 0))) break;
    selected.push(sentence);
    used = next;
  }

  if (question) {
    const candidate = [...selected, question].join(" ");
    if (candidate.length <= max) return candidate;
  }

  const candidate = selected.join(" ");
  if (candidate.length >= 80) return candidate;
  return `${message.slice(0, max - 3).trimEnd()}...`;
}

function accountAccessDecision(latestMessage: string): SupportToolDecision | null {
  if (!ACCOUNT_ACCESS.test(latestMessage)) return null;

  if (PASSWORD_REQUEST.test(latestMessage)) {
    return {
      message: compactSmsMessage("To change or reset your TheOutHaven password, go to https://www.theouthaven.com/forgot-password, enter your account email, and use the secure reset link we send. If you cannot access that email or the reset link does not arrive, reply here and I’ll continue helping. Never send your password or verification codes by text."),
      reason: "account_password_reset_guidance",
      category: "Account",
      priority: "normal",
      metadata: { support_tool: "account_access", account_action: "password_reset" },
    };
  }

  return {
    message: compactSmsMessage("For account access, start at https://www.theouthaven.com/login. If your password is the issue, use https://www.theouthaven.com/forgot-password. If you still cannot sign in or cannot access your account email, reply here and I’ll continue helping. Never send your password or verification codes by text."),
    reason: "account_access_guidance",
    category: "Account",
    priority: "normal",
    metadata: { support_tool: "account_access", account_action: "login_help" },
  };
}

function extractSearchName(message: string) {
  const cleaned = message.trim();
  const patterns = [
    /(?:search|find|look up|lookup)\s+(?:for\s+)?(?:my\s+)?(?:location|business|restaurant|bar|venue|listing|profile)\s+(.+)$/i,
    /(?:my\s+)?(?:location|business|restaurant|bar|venue)\s+(?:is|called|named)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) return cleanSearchTerm(match[1]);
  }
  return "";
}

function looksLikeAreaOnly(message: string) {
  const cleaned = cleanSearchTerm(message);
  if (!cleaned || cleaned.split(/\s+/).length > 4) return false;
  return !/\b(claim|search|find|location|restaurant|business|help|code|link|qr|email|phone|address)\b/i.test(cleaned);
}

export function extractClaimSearchContext(messages: string[], latestMessage: string) {
  const all = [...messages, latestMessage].filter(Boolean);
  const claimContext = all.some((message) => CLAIM_CONTEXT.test(message));
  if (!claimContext) return null;

  let locationName = "";
  for (const message of [...all].reverse()) {
    locationName = extractSearchName(message);
    if (locationName) break;
  }
  if (!locationName) return null;

  let area = "";
  if (looksLikeAreaOnly(latestMessage) && cleanSearchTerm(latestMessage) !== locationName) {
    area = cleanSearchTerm(latestMessage);
  }

  return { locationName, area };
}

async function loadConversation(ticketId: string) {
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("body,direction,created_at")
    .eq("ticket_id", ticketId)
    .or("internal_note.is.null,internal_note.eq.false")
    .order("created_at", { ascending: false })
    .limit(18);
  if (error) throw error;
  return ((data || []) as ConversationMessage[]).reverse();
}

async function searchLocations(locationName: string, area: string) {
  const term = cleanSearchTerm(locationName);
  if (term.length < 3) return [] as OnboardingLocation[];

  const search = `%${term}%`;
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,location_type,primary_category,address,city,state,zip_code,phone,website,is_claimed,claimed,claim_status,owner_user_id,is_hidden,is_demo,active,deleted_at")
    .is("deleted_at", null)
    .eq("active", true)
    .or([
      `name.ilike.${search}`,
      `restaurant_name.ilike.${search}`,
      `activity_name.ilike.${search}`,
    ].join(","))
    .limit(30);

  if (error) throw error;

  const normalizedArea = normalize(area);
  return (data || [])
    .filter((row: any) => !row.is_hidden || row.is_demo === true)
    .map((row: any) => toOnboardingLocation(row as Record<string, unknown>))
    .filter((location) => {
      if (!normalizedArea) return true;
      const haystack = normalize([location.city, location.state, location.zipCode, location.address].filter(Boolean).join(" "));
      return haystack.includes(normalizedArea) || normalizedArea.includes(normalize(location.city || ""));
    })
    .sort((left, right) => rankOnboardingLocation(right, term) - rankOnboardingLocation(left, term) || left.name.localeCompare(right.name))
    .slice(0, 4);
}

function locationLabel(location: OnboardingLocation) {
  return [location.name, location.address, location.city, location.state].filter(Boolean).join(", ");
}

function claimLink(location: OnboardingLocation) {
  return `https://www.theouthaven.com/business/claim/no-code?location=${encodeURIComponent(location.id)}`;
}

async function claimLocationDecision(latestMessage: string, conversation: ConversationMessage[]) {
  const inbound = conversation.filter((item) => item.direction === "inbound").map((item) => String(item.body || "").trim()).filter(Boolean);
  const context = extractClaimSearchContext(inbound, latestMessage);
  if (!context) return null;

  const matches = await searchLocations(context.locationName, context.area);
  if (!matches.length) {
    const areaText = context.area ? ` in ${context.area}` : "";
    return {
      message: `I couldn't confidently match ${context.locationName}${areaText}. Send the street address or ZIP and I'll narrow it down.`,
      reason: "claim_location_lookup_no_match",
      category: "Business Claim",
      priority: "normal",
      subject: `Claim help: ${context.locationName}`.slice(0, 120),
      metadata: { support_tool: "location_lookup", location_name: context.locationName, area: context.area || null, match_count: 0 },
    } satisfies SupportToolDecision;
  }

  if (matches.length > 1) {
    const options = matches.slice(0, 2).map((location, index) => `${index + 1}) ${locationLabel(location)}`).join("  ");
    return {
      message: compactSmsMessage(`I found more than one match. ${options} Reply 1 or 2, or send the street address.`),
      reason: "claim_location_lookup_multiple_matches",
      category: "Business Claim",
      priority: "normal",
      subject: `Claim help: ${context.locationName}`.slice(0, 120),
      metadata: { support_tool: "location_lookup", location_name: context.locationName, area: context.area || null, match_count: matches.length, candidate_ids: matches.map((item) => item.id) },
    } satisfies SupportToolDecision;
  }

  const location = matches[0];
  if (location.alreadyClaimed) {
    return {
      message: compactSmsMessage(`I found ${locationLabel(location)}. It is already claimed. If this is your business, reply with your role at the business and I’ll guide you through ownership review.`),
      reason: "claim_location_lookup_already_claimed",
      category: "Business Claim",
      priority: "normal",
      subject: `Claim help: ${location.name}`.slice(0, 120),
      metadata: { support_tool: "location_lookup", location_id: location.id, already_claimed: true },
    } satisfies SupportToolDecision;
  }

  return {
    message: compactSmsMessage(`I found ${locationLabel(location)}. It is unclaimed. Start here: ${claimLink(location)} Sign in, select the listing, and complete ownership verification. Reply here if you get stuck.`),
    reason: "claim_location_lookup_found",
    category: "Business Claim",
    priority: "normal",
    subject: `Claim help: ${location.name}`.slice(0, 120),
    metadata: { support_tool: "location_lookup", location_id: location.id, already_claimed: false, claim_link: claimLink(location) },
  } satisfies SupportToolDecision;
}

export async function getSupportToolDecision(params: { ticketId: string; latestMessage: string }): Promise<SupportToolDecision | null> {
  const latestMessage = params.latestMessage.trim();
  if (!latestMessage) return null;

  const identityGate = await getSupportIdentityGateDecision({ ticketId: params.ticketId, latestMessage });
  if (identityGate) return identityGate;

  if (isResolutionMessage(latestMessage)) {
    return {
      message: "Glad that worked. I’ll mark this resolved. Reply here within 48 hours if you need anything else.",
      reason: "customer_confirmed_resolution",
      category: "General Support",
      priority: "low",
      resolved: true,
      metadata: { support_tool: "resolution_detection" },
    };
  }

  const accountDecision = accountAccessDecision(latestMessage);
  if (accountDecision) return accountDecision;

  const explicitTopic = inferExplicitSupportTopic(latestMessage);
  if (explicitTopic && explicitTopic !== "business_claim") return null;

  const conversation = await loadConversation(params.ticketId);
  const claimContext = conversation.some((item) => CLAIM_CONTEXT.test(String(item.body || ""))) || CLAIM_CONTEXT.test(latestMessage);
  const hasSearchIntent = CLAIM_SEARCH.test(latestMessage) || conversation.some((item) => CLAIM_SEARCH.test(String(item.body || "")));
  if (claimContext && hasSearchIntent) {
    return claimLocationDecision(latestMessage, conversation);
  }

  return null;
}
