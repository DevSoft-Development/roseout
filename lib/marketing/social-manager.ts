import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CommunityProvider = "instagram" | "facebook" | "tiktok" | "youtube";
export type CommunityPersonType = "consumer" | "business" | "creator" | "support" | "press" | "unknown";
export type CommunityRisk = "green" | "yellow" | "red";

type Analysis = {
  personType: CommunityPersonType;
  intent: string | null;
  occasion: string | null;
  area: string | null;
  timing: string | null;
  sentiment: "positive" | "neutral" | "frustrated" | "negative" | "urgent";
  opportunityScore: number;
  opportunityStrength: "very_strong" | "good" | "low";
  riskLevel: CommunityRisk;
  suggestedReply: string;
};

const AREAS = ["manhattan", "brooklyn", "queens", "bronx", "staten island", "long island", "garden city", "rockville centre", "huntington", "patchogue", "hoboken", "jersey city"];
const OCCASIONS: Array<[string, string[]]> = [
  ["Date Night", ["date night", "first date", "romantic"]],
  ["Birthday", ["birthday", "bday"]],
  ["Girls' Night", ["girls night", "girls' night"]],
  ["Friday Night", ["friday night"]],
  ["Weekend", ["weekend", "saturday", "sunday"]],
];

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function title(value: string | null) {
  return value ? value.replace(/\b\w/g, (char) => char.toUpperCase()) : null;
}

export function analyzeCommunityMessage(body: string): Analysis {
  const text = body.toLowerCase().trim();
  const business = includesAny(text, ["my restaurant", "my bar", "my lounge", "my business", "i own", "our restaurant", "our business", "get listed", "claim my"]);
  const creator = includesAny(text, ["collab", "collaboration", "creator", "influencer", "partnership", "sponsor me"]);
  const press = includesAny(text, ["press inquiry", "journalist", "reporter", "media request"]);
  const support = includesAny(text, ["can't log in", "cannot log in", "not working", "support", "help with my account"]);
  const legal = includesAny(text, ["lawyer", "attorney", "lawsuit", "legal notice", "subpoena"]);
  const safety = includesAny(text, ["unsafe", "assault", "threat", "police", "emergency"]);
  const payment = includesAny(text, ["refund", "chargeback", "charged me", "billing dispute"]);
  const complaint = includesAny(text, ["terrible", "awful", "scam", "fraud", "angry", "disappointed"]);
  const outing = includesAny(text, ["what should", "where should", "things to do", "something to do", "outing", "date night", "birthday", "girls night", "girls' night", "rooftop", "after dinner", "dinner and", "weekend ideas", "friday night"]);
  const personType: CommunityPersonType = business ? "business" : creator ? "creator" : press ? "press" : support ? "support" : outing ? "consumer" : "unknown";
  const area = AREAS.find((candidate) => text.includes(candidate)) || (text.includes("nyc") || text.includes("new york") ? "New York City" : null);
  const occasion = OCCASIONS.find(([, words]) => includesAny(text, words))?.[0] || null;
  const timing = text.includes("tonight") ? "Tonight" : text.includes("tomorrow") ? "Tomorrow" : text.includes("friday") ? "Friday" : text.includes("weekend") ? "This weekend" : null;
  const intent = business ? "Business listing" : creator ? "Creator partnership" : support ? "Support" : outing ? "Outing idea" : null;
  const riskLevel: CommunityRisk = legal || safety || press || payment ? "red" : complaint || creator || business ? "yellow" : "green";
  const sentiment = safety ? "urgent" : complaint ? "negative" : support ? "frustrated" : includesAny(text, ["love", "amazing", "great", "thank"]) ? "positive" : "neutral";

  let score = 15;
  if (outing) score += 35;
  if (business || creator) score += 30;
  if (area) score += 15;
  if (timing) score += 15;
  if (includesAny(text, ["need", "looking for", "recommend", "where should", "what should"])) score += 10;
  score = Math.max(0, Math.min(100, score));
  const opportunityStrength = score >= 80 ? "very_strong" : score >= 50 ? "good" : "low";

  let suggestedReply = "Thanks for reaching out. What are you looking for today?";
  if (outing) suggestedReply = `Absolutely${area ? ` — ${title(area)}` : ""}. Tell me the vibe and budget you want, and I’ll help you find an outing that fits.`;
  if (business) suggestedReply = "We can help with that. Share your business name and location and I’ll point you to the easiest way to get started.";
  if (creator) suggestedReply = "We’d love to learn more. Send your main social account, audience location, and the kind of content you create.";
  if (riskLevel === "red") suggestedReply = "Thanks for letting us know. I’m sending this to a member of our team so it gets the right attention.";
  if (complaint && riskLevel !== "red") suggestedReply = "Thanks for telling us. I’m sending this to a team member so we can look into it properly.";

  return { personType, intent, occasion, area: title(area), timing, sentiment, opportunityScore: score, opportunityStrength, riskLevel, suggestedReply };
}

export async function ingestCommunityEvent(input: {
  provider: CommunityProvider;
  externalUserId: string;
  username?: string | null;
  displayName?: string | null;
  externalMessageId?: string | null;
  externalThreadId?: string | null;
  conversationType?: "comment" | "dm" | "mention" | "reply" | "story_mention" | "public_opportunity";
  body: string;
  sourcePostId?: string | null;
  sourcePermalink?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const analysis = analyzeCommunityMessage(input.body);
  const now = new Date().toISOString();

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("social_community_contacts")
    .upsert({
      provider: input.provider,
      external_user_id: input.externalUserId,
      username: input.username || null,
      display_name: input.displayName || null,
      person_type: analysis.personType,
      last_seen_at: now,
      metadata: input.metadata || {},
    }, { onConflict: "provider,external_user_id" })
    .select("id")
    .single();
  if (contactError) throw contactError;

  let conversationQuery = supabaseAdmin
    .from("social_community_conversations")
    .select("id,status")
    .eq("provider", input.provider)
    .eq("contact_id", contact.id)
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(1);
  if (input.externalThreadId) conversationQuery = conversationQuery.eq("external_thread_id", input.externalThreadId);
  const { data: existing } = await conversationQuery.maybeSingle();

  let conversationId = existing?.id as string | undefined;
  if (!conversationId) {
    const { data: created, error } = await supabaseAdmin.from("social_community_conversations").insert({
      provider: input.provider,
      contact_id: contact.id,
      external_thread_id: input.externalThreadId || null,
      conversation_type: input.conversationType || "comment",
      person_type: analysis.personType,
      intent: analysis.intent,
      occasion: analysis.occasion,
      area: analysis.area,
      timing: analysis.timing,
      sentiment: analysis.sentiment,
      opportunity_strength: analysis.opportunityStrength,
      opportunity_score: analysis.opportunityScore,
      risk_level: analysis.riskLevel,
      source_post_id: input.sourcePostId || null,
      source_permalink: input.sourcePermalink || null,
      first_message_at: now,
      last_message_at: now,
      metadata: { suggested_reply: analysis.suggestedReply },
    }).select("id").single();
    if (error) throw error;
    conversationId = created.id;
  } else {
    await supabaseAdmin.from("social_community_conversations").update({
      person_type: analysis.personType,
      intent: analysis.intent,
      occasion: analysis.occasion,
      area: analysis.area,
      timing: analysis.timing,
      sentiment: analysis.sentiment,
      opportunity_strength: analysis.opportunityStrength,
      opportunity_score: analysis.opportunityScore,
      risk_level: analysis.riskLevel,
      last_message_at: now,
      status: analysis.riskLevel === "red" ? "escalated" : "needs_reply",
      metadata: { suggested_reply: analysis.suggestedReply },
    }).eq("id", conversationId);
  }

  const messageKey = input.externalMessageId || `local:${createHash("sha256").update(`${input.provider}:${input.externalUserId}:${input.body}:${now}`).digest("hex")}`;
  const { error: messageError } = await supabaseAdmin.from("social_community_messages").upsert({
    conversation_id: conversationId,
    provider: input.provider,
    external_message_id: messageKey,
    direction: "inbound",
    sender_type: "consumer",
    body: input.body,
    status: "received",
    metadata: input.metadata || {},
  }, { onConflict: "provider,external_message_id", ignoreDuplicates: true });
  if (messageError) throw messageError;

  return { conversationId, analysis };
}

export function communitySearchLink(input: { conversationId: string; provider: string; query?: string | null }) {
  const url = new URL("https://theouthaven.com/create");
  if (input.query) url.searchParams.set("q", input.query);
  url.searchParams.set("utm_source", input.provider);
  url.searchParams.set("utm_medium", "community");
  url.searchParams.set("utm_campaign", "social_manager");
  url.searchParams.set("toh_conversation", input.conversationId);
  url.searchParams.set("toh_touch", randomUUID());
  return url.toString();
}
