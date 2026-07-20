import { supabaseAdmin } from "@/lib/supabase-admin";
import { chooseOutcomeState, normalizeSearchOutcomeEventKind, searchOutcomeColumnsFor, type SearchOutcomeEventKind } from "./outcomes";

type JsonRecord = Record<string, any>;

export type SearchOutcomeAggregationInput = {
  eventId: string;
  searchId: string;
  eventType: string;
  occurredAt?: string | null;
  userId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  metadata?: JsonRecord | null;
};

function cleanText(value: unknown, max = 160) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function attribution(input: SearchOutcomeAggregationInput) {
  return {
    user_id: cleanText(input.userId, 80),
    anonymous_id: cleanText(input.anonymousId, 150),
    session_id: cleanText(input.sessionId, 150),
  };
}

export async function aggregateSearchOutcomeEvent(input: SearchOutcomeAggregationInput): Promise<{ ok: boolean; skipped?: boolean; kind?: SearchOutcomeEventKind; error?: unknown }> {
  const searchId = cleanText(input.searchId, 120);
  const eventId = cleanText(input.eventId, 120);
  const kind = normalizeSearchOutcomeEventKind(input.eventType);
  if (!searchId || !eventId || !kind) return { ok: true, skipped: true };

  try {
    const seen = await supabaseAdmin
      .from("search_outcome_event_receipts")
      .insert({ event_id: eventId, search_id: searchId, event_type: kind, occurred_at: input.occurredAt ?? new Date().toISOString() })
      .select("event_id")
      .maybeSingle();

    if (seen.error) {
      if (seen.error.code === "23505") return { ok: true, skipped: true, kind };
      throw seen.error;
    }

    const columns = searchOutcomeColumnsFor(kind);
    const state = chooseOutcomeState([kind]);
    const { error } = await supabaseAdmin.rpc("upsert_search_outcome_aggregate", {
      p_search_id: searchId,
      p_outcome_state: state,
      p_user_id: attribution(input).user_id,
      p_anonymous_id: attribution(input).anonymous_id,
      p_session_id: attribution(input).session_id,
      p_occurred_at: input.occurredAt ?? new Date().toISOString(),
      p_counts: columns,
    });
    if (error) throw error;
    return { ok: true, kind };
  } catch (error) {
    console.warn("[search-outcomes] aggregation failed", { searchId, eventId, eventType: input.eventType, error });
    return { ok: false, kind: kind ?? undefined, error };
  }
}
