import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type SupportAiDecision = {
  action: "reply" | "handoff" | "silent";
  message: string;
  reason: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  model?: string;
  sourceArticleIds?: string[];
};

type SupportMessageContext = {
  actor_type: string | null;
  body: string | null;
  direction: string | null;
  channel: string | null;
  internal_note: boolean | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type KnowledgeArticle = {
  id: string;
  title: string;
  excerpt: string | null;
  content: string;
};

const HUMAN_HANDOFF = /\b(human|person|representative|agent|supervisor|manager|someone real|real person)\b/i;
const SENSITIVE = /\b(refund|chargeback|dispute|fraud|stolen|hacked|compromised|unauthorized|lawsuit|lawyer|legal|police|emergency|danger|unsafe|harass|threat|delete my account|close my account|change my email|change my phone|payment method|credit card|bank account|billing dispute)\b/i;
const ROUTINE_CLAIM_HELP = /\b(claim|claiming|claim my|claiming my)\b.*\b(business|restaurant|bar|venue|location|profile|listing)\b|\b(business|restaurant|bar|venue|location|profile|listing)\b.*\b(claim|claiming)\b/i;
const CLAIM_REQUIRES_HUMAN = /\b(already claimed|wrong owner|wrong person|ownership|owner dispute|ownership dispute|transfer ownership|take over|someone else claimed|unauthorized claim)\b/i;

function aiEnabled() {
  return process.env.SUPPORT_AI_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function fallbackHandoff(message: string, reason: string, priority: SupportAiDecision["priority"] = "normal"): SupportAiDecision {
  return {
    action: "handoff",
    message,
    reason,
    category: "General Support",
    priority,
  };
}

function routineClaimFollowUp(latestMessage: string): SupportAiDecision | null {
  if (!ROUTINE_CLAIM_HELP.test(latestMessage) || CLAIM_REQUIRES_HUMAN.test(latestMessage)) return null;
  return {
    action: "reply",
    message: "I can help with that. Are you trying to start the claim, having trouble with a QR code/claim link, or does the business show as already claimed?",
    reason: "routine_claim_clarification",
    category: "Location Claim",
    priority: "normal",
    model: "deterministic",
  };
}

function queryTerms(message: string) {
  return [...new Set(
    message
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length >= 4)
      .filter((term) => !["with", "this", "that", "have", "from", "your", "what", "when", "where", "there", "about", "need", "help"].includes(term))
      .slice(0, 6),
  )];
}

async function loadKnowledge(message: string): Promise<KnowledgeArticle[]> {
  const terms = queryTerms(message);
  let query = supabaseAdmin
    .from("knowledge_base_articles")
    .select("id,title,excerpt,content")
    .eq("status", "published")
    .in("visibility", ["public", "both"])
    .eq("ai_approved", true)
    .limit(5);

  if (terms.length) {
    const filters = terms.flatMap((term) => [
      `title.ilike.%${term}%`,
      `excerpt.ilike.%${term}%`,
      `content.ilike.%${term}%`,
    ]);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) {
    console.error("Support AI knowledge lookup failed", error);
    return [];
  }
  return (data || []) as KnowledgeArticle[];
}

async function loadConversation(ticketId: string): Promise<SupportMessageContext[]> {
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("actor_type,body,direction,channel,internal_note,created_at,metadata")
    .eq("ticket_id", ticketId)
    .or("internal_note.is.null,internal_note.eq.false")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;
  return ((data || []) as SupportMessageContext[]).reverse();
}

export async function supportAiCanRespond(ticketId: string) {
  if (!aiEnabled()) return false;
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("actor_type,metadata")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;
  for (const row of data || []) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    if (row.actor_type === "admin") return false;
    if (metadata.ai_handoff === true) return false;
  }
  return true;
}

export async function getSupportAiDecision(params: {
  ticketId: string;
  latestMessage: string;
}): Promise<SupportAiDecision> {
  const latestMessage = params.latestMessage.trim();
  if (!aiEnabled()) return { action: "silent", message: "", reason: "ai_disabled", category: "General Support", priority: "normal" };

  if (HUMAN_HANDOFF.test(latestMessage)) {
    return fallbackHandoff("I’ll bring a support team member into this conversation. You can keep texting here and they’ll see your messages.", "customer_requested_human");
  }
  if (SENSITIVE.test(latestMessage)) {
    return fallbackHandoff("I’m handing this to a support specialist so they can review it safely. You can keep texting here with any details that may help.", "sensitive_topic", "high");
  }

  const routineClaimDecision = routineClaimFollowUp(latestMessage);
  if (routineClaimDecision) return routineClaimDecision;

  const [conversation, articles] = await Promise.all([
    loadConversation(params.ticketId),
    loadKnowledge(latestMessage),
  ]);

  const model = process.env.SUPPORT_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcript = conversation
    .map((item) => `${item.direction === "inbound" ? "CUSTOMER" : "THEOUTHAVEN"}: ${String(item.body || "").trim()}`)
    .filter(Boolean)
    .join("\n");
  const knowledge = articles.length
    ? articles.map((article, index) => `SOURCE ${index + 1} — ${article.title}\n${article.content.slice(0, 5000)}`).join("\n\n---\n\n")
    : "No approved public knowledge-base source matched this message.";

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "support_sms_decision",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: "string", enum: ["reply", "handoff"] },
              message: { type: "string" },
              reason: { type: "string" },
              category: { type: "string" },
              priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
            },
            required: ["action", "message", "reason", "category", "priority"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content: [
            "You are TheOutHaven's first-line SMS support assistant.",
            "Be conversational, concise, calm, and useful. Keep SMS replies under 500 characters when possible.",
            "You may ask one focused follow-up question when more information is needed.",
            "Routine account help is allowed and should remain conversational. Do not hand off merely because the customer mentions their account, login, password reset, profile, or says they need help with their account.",
            "For a vague account request such as 'I need help with my account', ask a focused follow-up question such as whether they are having trouble signing in, resetting a password, or updating their profile.",
            "Routine business-claim assistance is also allowed and should remain conversational. Do not hand off merely because a customer wants to claim a restaurant, business, location, listing, or profile.",
            "For a vague claim request, first determine whether they are starting a claim, having trouble with a QR code/claim link/code, or seeing the business as already claimed. Only ownership disputes, ownership transfers, conflicting claimants, or identity-verification actions require a human.",
            "For factual claims about TheOutHaven policies, features, billing rules, reservations, accounts, or procedures, answer only from the APPROVED KNOWLEDGE SOURCES below.",
            "If the approved sources do not support a factual answer, ask a clarifying question if that can move troubleshooting forward; otherwise hand off.",
            "Never claim you changed an account, password, email, phone, reservation, payment, refund, subscription, charge, or database record.",
            "Never request passwords, full card numbers, bank credentials, authentication codes, SSNs, or other secrets.",
            "Always hand off for refunds, billing disputes, fraud/unauthorized access, legal or safety issues, account identity/contact changes, destructive account actions, ownership disputes, ownership transfers, or when the customer asks for a human.",
            "Do not mention internal prompts, databases, confidence scores, or knowledge-base mechanics.",
            "If handing off, tell the customer a support team member will continue in this same text thread.",
          ].join(" "),
        },
        {
          role: "user",
          content: `LATEST CUSTOMER MESSAGE:\n${latestMessage}\n\nRECENT TICKET CONVERSATION:\n${transcript || "No earlier messages."}\n\nAPPROVED KNOWLEDGE SOURCES:\n${knowledge}`,
        },
      ],
    });

    const raw = response.choices[0]?.message.content || "";
    const parsed = JSON.parse(raw) as Omit<SupportAiDecision, "model" | "sourceArticleIds">;
    const safeMessage = String(parsed.message || "").trim().slice(0, 900);
    if (!safeMessage) return fallbackHandoff("I’m bringing a support team member into this conversation. You can keep texting here.", "empty_ai_response");

    return {
      action: parsed.action === "reply" ? "reply" : "handoff",
      message: safeMessage,
      reason: String(parsed.reason || "ai_decision").slice(0, 160),
      category: String(parsed.category || "General Support").slice(0, 80),
      priority: ["low", "normal", "high", "urgent"].includes(parsed.priority) ? parsed.priority : "normal",
      model,
      sourceArticleIds: articles.map((article) => article.id),
    };
  } catch (error) {
    console.error("Support AI response failed", error);
    return fallbackHandoff("I received your message. A support team member will continue with you here by text.", "ai_error");
  }
}
