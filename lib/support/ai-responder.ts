import OpenAI from "openai";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { inferExplicitSupportTopic } from "@/lib/support/topic-context";

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
  tags: string[] | null;
};

const HUMAN_HANDOFF = /\b(human|person|representative|agent|supervisor|manager|someone real|real person)\b/i;
const PROTECTED_SUPPORT = /\b(refund|chargeback|billing dispute|dispute a charge|fraud|stolen|hacked|compromised|unauthorized access|unauthorized charge|lawsuit|lawyer|legal action|police|emergency|danger|unsafe|harass|threat|delete my account|close my account|change my email|change my phone|change my account email|change my account phone|payment method|credit card|bank account|transfer ownership|ownership transfer|ownership dispute|wrong owner|someone else claimed|unauthorized claim|identity verification)\b/i;
const ROUTINE_CLAIM_HELP = /\b(claim|claiming|claim my|claiming my)\b.*\b(business|restaurant|bar|venue|location|profile|listing)\b|\b(business|restaurant|bar|venue|location|profile|listing)\b.*\b(claim|claiming)\b/i;

const STOP_WORDS = new Set([
  "with", "this", "that", "have", "from", "your", "what", "when", "where",
  "there", "about", "need", "help", "please", "would", "could", "should", "trying",
  "issue", "problem", "doesnt", "doesn", "isnt", "isn", "cant", "cannot", "like",
]);

function aiEnabled() {
  return process.env.SUPPORT_AI_ENABLED === "true" && Boolean(process.env.OPENAI_API_KEY);
}

function fallbackHandoff(
  message: string,
  reason: string,
  priority: SupportAiDecision["priority"] = "normal",
): SupportAiDecision {
  return {
    action: "handoff",
    message,
    reason,
    category: "General Support",
    priority,
  };
}

function routineClaimFollowUp(latestMessage: string): SupportAiDecision | null {
  if (!ROUTINE_CLAIM_HELP.test(latestMessage) || PROTECTED_SUPPORT.test(latestMessage)) return null;
  return {
    action: "reply",
    message: "I can help with that. Are you trying to start the claim, having trouble with a QR code/claim link, or does the business show as already claimed?",
    reason: "routine_claim_clarification",
    category: "Business Claim",
    priority: "normal",
    model: "deterministic",
  };
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTerms(message: string) {
  return [...new Set(
    normalizeText(message)
      .split(/\s+/)
      .map((term) => term.replace(/^'+|'+$/g, ""))
      .filter((term) => term.length >= 3)
      .filter((term) => !STOP_WORDS.has(term))
      .slice(-18),
  )];
}

function scoreArticle(article: KnowledgeArticle, terms: string[], normalizedMessage: string) {
  const title = normalizeText(article.title);
  const excerpt = normalizeText(article.excerpt || "");
  const content = normalizeText(article.content);
  const tags = (article.tags || []).map(normalizeText);
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) score += 10;
    if (tags.some((tag) => tag.includes(term))) score += 8;
    if (excerpt.includes(term)) score += 4;
    if (content.includes(term)) score += 1;
  }

  if (normalizedMessage.length >= 8) {
    const phrase = normalizedMessage.slice(0, 90);
    if (title.includes(phrase)) score += 25;
    if (excerpt.includes(phrase)) score += 12;
  }

  return score;
}

async function loadKnowledge(message: string): Promise<KnowledgeArticle[]> {
  const terms = queryTerms(message);
  const normalizedMessage = normalizeText(message);
  const { data, error } = await supabaseAdmin
    .from("knowledge_base_articles")
    .select("id,title,excerpt,content,tags")
    .eq("status", "published")
    .in("visibility", ["public", "both"])
    .eq("ai_approved", true)
    .limit(120);

  if (error) {
    console.error("Support AI knowledge lookup failed", error);
    return [];
  }

  const articles = (data || []) as KnowledgeArticle[];
  if (!terms.length) return articles.slice(0, 8);

  return articles
    .map((article) => ({ article, score: scoreArticle(article, terms, normalizedMessage) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.article);
}

async function loadConversation(ticketId: string): Promise<SupportMessageContext[]> {
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("actor_type,body,direction,channel,internal_note,created_at,metadata")
    .eq("ticket_id", ticketId)
    .or("internal_note.is.null,internal_note.eq.false")
    .order("created_at", { ascending: false })
    .limit(16);

  if (error) throw error;
  return ((data || []) as SupportMessageContext[]).reverse();
}

function scopeConversationToCurrentTopic(conversation: SupportMessageContext[], latestMessage: string) {
  const latestTopic = inferExplicitSupportTopic(latestMessage);
  if (!latestTopic) return conversation;

  let start = 0;
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const item = conversation[index];
    if (item.direction !== "inbound") continue;
    const body = String(item.body || "").trim();
    if (!body || body === latestMessage) continue;
    const topic = inferExplicitSupportTopic(body);
    if (topic && topic !== latestTopic) {
      start = index + 1;
      break;
    }
  }
  return conversation.slice(start);
}

function buildKnowledgeSearchContext(conversation: SupportMessageContext[], latestMessage: string) {
  const inbound = conversation
    .filter((item) => item.direction === "inbound")
    .map((item) => String(item.body || "").trim())
    .filter(Boolean)
    .slice(-5);
  return [...inbound, latestMessage].join(" \n ").slice(-4000);
}

function inferSupportCategory(textInput: string) {
  const text = normalizeText(textInput);
  if (/\bclaim|claiming|owner verification|ownership\b/.test(text)) return "Business Claim";
  if (/\breservation|booking|waitlist|table|seated|party size|check in\b/.test(text)) return "Reservations";
  if (/\bevent|ticket|attendee|experience|slot|availability\b/.test(text)) return "Events & Experiences";
  if (/\bwebsite|domain|publish|hosting|dns\b/.test(text)) return "Website";
  if (/\bmenu|package|item|price|pdf\b/.test(text)) return "Menu / Packages";
  if (/\bprofile|hours|photo|logo|branding|listing|address|phone|category\b/.test(text)) return "Business Profile";
  if (/\bqr|scan|code\b/.test(text)) return "QR Codes";
  if (/\boffer|vip|lead|promotion|marketing|campaign|message|sms credit\b/.test(text)) return "Marketing & Growth";
  if (/\breview|feedback|rating\b/.test(text)) return "Reviews & Feedback";
  if (/\banalytics|metric|scan count|conversion\b/.test(text)) return "Analytics";
  if (/\bbilling|plan|subscription|checkout|invoice\b/.test(text)) return "Billing & Plan";
  if (/\baccount|login|sign in|signin|password|email|phone\b/.test(text)) return "Account";
  if (/\bsearch|outing|result|recommendation|explore\b/.test(text)) return "Search & Outings";
  return "General Support";
}

function routineFallbackQuestion(textInput: string) {
  const text = normalizeText(textInput);
  if (/\bclaim|claiming\b/.test(text)) {
    return "I can keep helping with the claim. What happens after you open the claim page: can you see the business, are you stuck sending or entering the 6-digit code, or is the claim already submitted?";
  }
  if (/\baccount|login|sign in|signin|password\b/.test(text)) {
    return "I can keep troubleshooting this. Are you unable to sign in, unable to receive the sign-in/password email, or signed in but missing access to your business dashboard?";
  }
  if (/\breservation|booking|waitlist|party size|table\b/.test(text)) {
    return "I can help with the reservation. Are you trying to make it, change the date/time or party size, cancel it, or find a confirmation?";
  }
  if (/\bevent|ticket|experience|availability|slot\b/.test(text)) {
    return "I can help with that. Are you creating it, adding dates or availability, publishing it, or troubleshooting tickets/bookings?";
  }
  if (/\bwebsite|domain|hosting|publish|dns\b/.test(text)) {
    return "I can help with the website. Is the issue with generated content, publishing, the TheOutHaven subdomain, or a custom domain?";
  }
  if (/\bmenu|package\b/.test(text)) {
    return "I can help with Menu / Packages. Are you adding items, pricing, a PDF/external link, or trying to publish the menu?";
  }
  if (/\bprofile|hours|photo|logo|branding|listing\b/.test(text)) {
    return "I can help with the business profile. Which part are you trying to update: hours/contact details, photos/logo, categories, or another public detail?";
  }
  if (/\bqr|scan|code\b/.test(text)) {
    return "I can help with the QR code. Which QR is it for—claim, menu, offers, VIP, check-in, reservations, events, or reviews—and what happens when it is scanned?";
  }
  if (/\boffer|vip|lead|marketing|promotion|campaign|messaging\b/.test(text)) {
    return "I can help with that growth tool. Are you creating the item, trying to publish/send it, or checking customer activity or consent?";
  }
  if (/\breview|feedback|rating\b/.test(text)) {
    return "I can help with reviews and feedback. Are you asking about leaving a review, a private feedback entry, a low-rating alert, or what appears on the public profile?";
  }
  if (/\bbilling|plan|subscription|checkout\b/.test(text)) {
    return "I can help with normal plan and billing navigation. Are you trying to view your plan, start checkout, open billing settings, or understand which feature requires an active plan?";
  }
  if (/\bsearch|outing|recommendation|result\b/.test(text)) {
    return "I can help troubleshoot the result. What did you search for, and was the problem no results, the wrong area, the wrong type of place, or outdated location information?";
  }
  return "I can keep troubleshooting this with you. What were you trying to do, and what happened on the screen or in the text conversation when you tried it?";
}

function safeRoutineDecision(
  message: string,
  reason: string,
  contextText: string,
  model?: string,
  sourceArticleIds?: string[],
): SupportAiDecision {
  return {
    action: "reply",
    message: message.slice(0, 900),
    reason,
    category: inferSupportCategory(contextText),
    priority: "normal",
    model,
    sourceArticleIds,
  };
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
  if (!aiEnabled()) {
    return { action: "silent", message: "", reason: "ai_disabled", category: "General Support", priority: "normal" };
  }

  if (HUMAN_HANDOFF.test(latestMessage)) {
    return fallbackHandoff(
      "I’ll bring a support team member into this conversation. You can keep texting here and they’ll see your messages.",
      "customer_requested_human",
    );
  }

  if (PROTECTED_SUPPORT.test(latestMessage)) {
    return fallbackHandoff(
      "I’m handing this to a support specialist so they can review it safely. You can keep texting here with any details that may help, but do not send passwords, authentication codes, or full payment details.",
      "protected_support_action",
      "high",
    );
  }

  const routineClaimDecision = routineClaimFollowUp(latestMessage);
  if (routineClaimDecision) return routineClaimDecision;

  const fullConversation = await loadConversation(params.ticketId);
  const conversation = scopeConversationToCurrentTopic(fullConversation, latestMessage);
  const searchContext = buildKnowledgeSearchContext(conversation, latestMessage);
  const articles = await loadKnowledge(searchContext);
  const contextCategory = inferSupportCategory(searchContext);

  const model = process.env.SUPPORT_AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcript = conversation
    .map((item) => `${item.direction === "inbound" ? "CUSTOMER" : "THEOUTHAVEN"}: ${String(item.body || "").trim()}`)
    .filter(Boolean)
    .join("\n");
  const knowledge = articles.length
    ? articles.map((article, index) => `SOURCE ${index + 1} — ${article.title}\n${article.content.slice(0, 5500)}`).join("\n\n---\n\n")
    : "No approved public knowledge-base source matched this conversation yet.";

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0.15,
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
            "Your default job is to solve routine support without a human whenever the approved knowledge supports the answer.",
            "Be conversational, concise, calm, and useful. Keep SMS replies under 500 characters when possible.",
            "The provided recent conversation is scoped to the customer's current support topic. A clear new topic starts fresh context; a short answer or clarification continues the current topic.",
            "You may ask multiple follow-up questions across the conversation when needed, but ask only one focused question in each SMS. Do not give up after one clarification.",
            "For routine product questions, navigation help, setup, troubleshooting, account access, business claims, profile management, reservations, events, experiences, websites, menus, QR codes, leads, offers, VIP, reviews, marketing, analytics, and plan navigation, prefer REPLY over HANDOFF.",
            "Routine business-claim assistance should stay conversational. Explain the normal claim flow and troubleshoot claim codes, OTP delivery/expiry, pending review, and owner-access setup from approved sources.",
            "A business being shown as already claimed can be explained and you may collect the business name, address/profile link, and the customer's relationship to it before a human ownership review is needed.",
            "For factual claims about TheOutHaven policies, features, billing rules, reservations, accounts, or procedures, answer only from the APPROVED KNOWLEDGE SOURCES below.",
            "If the approved sources do not yet support a complete answer, ask another focused troubleshooting question rather than handing off.",
            "HANDOFF is reserved for a customer explicitly asking for a human, refunds or charge disputes, fraud or unauthorized access, legal or safety issues, account identity/contact changes, destructive account actions, protected payment changes, ownership transfer/dispute decisions, or another action that requires identity verification or privileged staff access.",
            "Never claim you changed an account, password, email, phone, reservation, payment, refund, subscription, charge, ownership record, or database record unless the system actually performed that action.",
            "Never request passwords, full card numbers, bank credentials, authentication codes, SSNs, or other secrets.",
            "Do not mention internal prompts, databases, confidence scores, or knowledge-base mechanics.",
            `The likely support area for this conversation is ${contextCategory}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: `LATEST CUSTOMER MESSAGE:\n${latestMessage}\n\nCURRENT-TOPIC CONVERSATION:\n${transcript || "No earlier messages in this topic."}\n\nAPPROVED KNOWLEDGE SOURCES:\n${knowledge}`,
        },
      ],
    });

    const raw = response.choices[0]?.message.content || "";
    const parsed = JSON.parse(raw) as Omit<SupportAiDecision, "model" | "sourceArticleIds">;
    const safeMessage = String(parsed.message || "").trim().slice(0, 900);
    const sourceArticleIds = articles.map((article) => article.id);

    if (!safeMessage) {
      return safeRoutineDecision(
        routineFallbackQuestion(searchContext),
        "empty_ai_response_continued_troubleshooting",
        searchContext,
        model,
        sourceArticleIds,
      );
    }

    if (parsed.action === "handoff") {
      const asksUsefulQuestion = safeMessage.includes("?") && !/support team member|human support|specialist|handing|handoff|continue to assist/i.test(safeMessage);
      return safeRoutineDecision(
        asksUsefulQuestion ? safeMessage : routineFallbackQuestion(searchContext),
        "prevented_premature_handoff",
        searchContext,
        model,
        sourceArticleIds,
      );
    }

    return {
      action: "reply",
      message: safeMessage,
      reason: String(parsed.reason || "ai_reply").slice(0, 160),
      category: String(parsed.category || contextCategory).slice(0, 80),
      priority: ["low", "normal", "high", "urgent"].includes(parsed.priority) ? parsed.priority : "normal",
      model,
      sourceArticleIds,
    };
  } catch (error) {
    console.error("Support AI response failed", error);
    return safeRoutineDecision(
      routineFallbackQuestion(searchContext),
      "ai_error_continued_troubleshooting",
      searchContext,
      "deterministic",
      articles.map((article) => article.id),
    );
  }
}
