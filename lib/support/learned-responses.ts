import { supabaseAdmin } from "@/lib/supabase-admin";

export type LearnedSupportResponse = {
  id: string;
  responseText: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  similarity: number;
  confidence: number;
  sourceArticleIds: string[];
};

const HUMAN_HANDOFF = /\b(human|person|representative|agent|supervisor|manager|someone real|real person)\b/i;
const SENSITIVE = /\b(refund|chargeback|dispute|fraud|stolen|hacked|compromised|unauthorized|lawsuit|lawyer|legal|police|emergency|danger|unsafe|harass|threat|delete my account|close my account|change my email|change my phone|payment method|credit card|bank account|billing dispute)\b/i;

export function normalizeSupportLearningText(input: string) {
  return input
    .toLowerCase()
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " <email> ")
    .replace(/\+?1?[\s().-]*(?:\d[\s().-]*){10,}/g, " <phone> ")
    .replace(/\b\d{5,}\b/g, " <number> ")
    .replace(/[^a-z0-9<>\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export async function learnedSupportReplyAllowed(ticketId: string, message: string) {
  if (HUMAN_HANDOFF.test(message) || SENSITIVE.test(message)) return false;
  const { data, error } = await supabaseAdmin
    .from("support_ticket_messages")
    .select("actor_type,metadata")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  for (const row of data || []) {
    const metadata = (row.metadata || {}) as Record<string, unknown>;
    if (row.actor_type === "admin" || metadata.ai_handoff === true) return false;
  }
  return true;
}

export async function getLearnedSupportResponse(message: string): Promise<LearnedSupportResponse | null> {
  if (process.env.SUPPORT_LEARNED_RESPONSES_ENABLED === "false") return null;
  const normalized = normalizeSupportLearningText(message);
  if (normalized.length < 4) return null;

  const thresholdValue = Number(process.env.SUPPORT_LEARNED_RESPONSE_THRESHOLD || "0.84");
  const threshold = Number.isFinite(thresholdValue) ? Math.min(0.98, Math.max(0.7, thresholdValue)) : 0.84;
  const { data, error } = await supabaseAdmin.rpc("match_support_learned_response", {
    p_question: normalized,
    p_threshold: threshold,
  });
  if (error) {
    console.error("Learned support response lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.id || !row?.response_text) return null;
  return {
    id: String(row.id),
    responseText: String(row.response_text).trim().slice(0, 900),
    category: String(row.category || "General Support").slice(0, 80),
    priority: ["low", "normal", "high", "urgent"].includes(String(row.priority))
      ? (String(row.priority) as LearnedSupportResponse["priority"])
      : "normal",
    similarity: Number(row.similarity_score || 0),
    confidence: Number(row.confidence || 0),
    sourceArticleIds: Array.isArray(row.source_article_ids) ? row.source_article_ids.map(String) : [],
  };
}
