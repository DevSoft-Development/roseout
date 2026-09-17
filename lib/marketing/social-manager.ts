import "server-only";

import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { sendCommunityReply } from "@/lib/marketing/social-community-provider";
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

type SocialManagerSettings = {
  operating_mode: "suggest" | "assisted" | "autopilot";
  handle_basic_questions: boolean;
  handle_outing_requests: boolean;
  handle_business_questions: boolean;
  handle_creator_questions: boolean;
  handle_comments: boolean;
  handle_direct_messages: boolean;
};

const DEFAULT_SETTINGS: SocialManagerSettings = {
  operating_mode: "assisted",
  handle_basic_questions: true,
  handle_outing_requests: true,
  handle_business_questions: false,
  handle_creator_questions: false,
  handle_comments: true,
  handle_direct_messages: true,
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

function deterministicAnalysis(body: string): Analysis {
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

const riskRank: Record<CommunityRisk, number> = { green: 0, yellow: 1, red: 2 };

function safeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function analyzeCommunityMessage(body: string): Analysis {
  return deterministicAnalysis(body);
}

async function analyzeCommunityMessageWithAi(body: string): Promise<Analysis> {
  const fallback = deterministicAnalysis(body);
  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: process.env.SOCIAL_MANAGER_AI_MODEL || "gpt-4o-mini",
      temperature: 0.25,
      max_tokens: 650,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are TheOutHaven's social community triage assistant. Analyze the user's message, do not invent facts, and return JSON only. Safety, payment, legal, press/media, threats, emergencies, serious complaints, and sensitive partnership negotiation must never be downgraded. Suggested replies must be brief, helpful, natural, and must not promise unavailable services or discounts.",
        },
        {
          role: "user",
          content: `Return JSON with exactly these keys: personType, intent, occasion, area, timing, sentiment, opportunityScore, opportunityStrength, riskLevel, suggestedReply.\nAllowed personType: consumer,business,creator,support,press,unknown.\nAllowed sentiment: positive,neutral,frustrated,negative,urgent.\nAllowed opportunityStrength: very_strong,good,low.\nAllowed riskLevel: green,yellow,red.\nRisk meaning: green=routine safe request; yellow=business/creator negotiation or complaint that needs review; red=legal,payments,safety,press/media,threats/emergency or otherwise sensitive.\nMessage: ${JSON.stringify(body)}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const aiRisk = safeEnum(parsed.riskLevel, ["green", "yellow", "red"] as const, fallback.riskLevel);
    const finalRisk = riskRank[aiRisk] >= riskRank[fallback.riskLevel] ? aiRisk : fallback.riskLevel;
    const score = Math.max(0, Math.min(100, Number(parsed.opportunityScore ?? fallback.opportunityScore) || fallback.opportunityScore));
    return {
      personType: safeEnum(parsed.personType, ["consumer", "business", "creator", "support", "press", "unknown"] as const, fallback.personType),
      intent: typeof parsed.intent === "string" && parsed.intent.trim() ? parsed.intent.trim().slice(0, 120) : fallback.intent,
      occasion: typeof parsed.occasion === "string" && parsed.occasion.trim() ? parsed.occasion.trim().slice(0, 80) : fallback.occasion,
      area: typeof parsed.area === "string" && parsed.area.trim() ? parsed.area.trim().slice(0, 100) : fallback.area,
      timing: typeof parsed.timing === "string" && parsed.timing.trim() ? parsed.timing.trim().slice(0, 80) : fallback.timing,
      sentiment: safeEnum(parsed.sentiment, ["positive", "neutral", "frustrated", "negative", "urgent"] as const, fallback.sentiment),
      opportunityScore: score,
      opportunityStrength: score >= 80 ? "very_strong" : score >= 50 ? "good" : "low",
      riskLevel: finalRisk,
      suggestedReply: typeof parsed.suggestedReply === "string" && parsed.suggestedReply.trim() ? parsed.suggestedReply.trim().slice(0, 1000) : fallback.suggestedReply,
    };
  } catch {
    return fallback;
  }
}

async function loadSettings(): Promise<SocialManagerSettings> {
  const { data } = await supabaseAdmin
    .from("social_manager_settings")
    .select("operating_mode,handle_basic_questions,handle_outing_requests,handle_business_questions,handle_creator_questions,handle_comments,handle_direct_messages")
    .eq("scope", "platform")
    .maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}) } as SocialManagerSettings;
}

function canAutoHandle(settings: SocialManagerSettings, analysis: Analysis, conversationType: string) {
  if (settings.operating_mode === "suggest" || analysis.riskLevel !== "green") return false;
  if (conversationType === "dm" && !settings.handle_direct_messages) return false;
  if (conversationType !== "dm" && !settings.handle_comments) return false;
  if (analysis.personType === "consumer" && analysis.intent === "Outing idea") return settings.handle_outing_requests;
  if (analysis.personType === "business") return settings.operating_mode === "autopilot" && settings.handle_business_questions;
  if (analysis.personType === "creator") return settings.operating_mode === "autopilot" && settings.handle_creator_questions;
  if (analysis.personType === "unknown" || analysis.personType === "consumer") return settings.handle_basic_questions;
  return false;
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
  if (input.externalMessageId) {
    const { data: duplicate } = await supabaseAdmin
      .from("social_community_messages")
      .select("conversation_id")
      .eq("provider", input.provider)
      .eq("external_message_id", input.externalMessageId)
      .maybeSingle();
    if (duplicate?.conversation_id) return { conversationId: duplicate.conversation_id as string, duplicate: true };
  }

  const [analysis, settings] = await Promise.all([
    analyzeCommunityMessageWithAi(input.body),
    loadSettings(),
  ]);
  const now = new Date().toISOString();
  const conversationType = input.conversationType || "comment";

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
      conversation_type: conversationType,
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
      status: analysis.riskLevel === "red" ? "escalated" : "needs_reply",
      metadata: { suggested_reply: analysis.suggestedReply, ai_analyzed: Boolean(process.env.OPENAI_API_KEY) },
    }).select("id").single();
    if (error) throw error;
    conversationId = created.id;
  } else {
    const { error } = await supabaseAdmin.from("social_community_conversations").update({
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
      metadata: { suggested_reply: analysis.suggestedReply, ai_analyzed: Boolean(process.env.OPENAI_API_KEY) },
    }).eq("id", conversationId);
    if (error) throw error;
  }

  const messageKey = input.externalMessageId || `local:${createHash("sha256").update(`${input.provider}:${input.externalUserId}:${input.body}:${now}`).digest("hex")}`;
  const { error: messageError } = await supabaseAdmin.from("social_community_messages").insert({
    conversation_id: conversationId,
    provider: input.provider,
    external_message_id: messageKey,
    direction: "inbound",
    sender_type: "consumer",
    body: input.body,
    status: "received",
    metadata: input.metadata || {},
  });
  if (messageError) {
    if ((messageError as any).code === "23505") return { conversationId, duplicate: true };
    throw messageError;
  }

  let autoReplied = false;
  if (["instagram", "facebook"].includes(input.provider) && canAutoHandle(settings, analysis, conversationType)) {
    try {
      await sendCommunityReply({ conversationId, reply: analysis.suggestedReply, senderType: "ai" });
      autoReplied = true;
    } catch (error) {
      await supabaseAdmin.from("social_community_conversations").update({
        status: "needs_reply",
        metadata: {
          suggested_reply: analysis.suggestedReply,
          ai_analyzed: Boolean(process.env.OPENAI_API_KEY),
          auto_reply_error: error instanceof Error ? error.message.slice(0, 300) : "Automatic reply failed",
        },
      }).eq("id", conversationId);
    }
  }

  return { conversationId, analysis, autoReplied, operatingMode: settings.operating_mode };
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
