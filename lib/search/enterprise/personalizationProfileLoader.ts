import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildUserPreferenceProfile,
  type PreferenceEvent,
  type UserPreferenceProfile,
} from "./personalization";

const DEFAULT_TIMEOUT_MS = 200;
const MAX_ROWS_PER_SOURCE = 100;

type QueryClient = { from: (table: string) => any };

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function payloadValue(row: any, ...keys: string[]) {
  const payloads = [row?.metadata, row?.plan_payload, row?.reservation_payload];
  for (const key of keys) {
    const direct = text(row?.[key]);
    if (direct) return direct;
    for (const payload of payloads) {
      const nested = text(payload?.[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function preferenceFields(row: any) {
  return {
    cuisine: payloadValue(row, "cuisine", "cuisine_type", "restaurant_cuisine"),
    activity: payloadValue(row, "activity_type", "activity", "activity_category"),
    market: payloadValue(row, "market", "market_key", "city"),
  };
}

export async function queryPreferenceEvidence(
  userId: string,
  client: QueryClient = supabaseAdmin as unknown as QueryClient,
): Promise<PreferenceEvent[]> {
  const [analyticsResult, outingsResult] = await Promise.all([
    client
      .from("analytics_events")
      .select("event_name,event_type,cuisine,activity_type,city,metadata,created_at")
      .eq("user_id", userId)
      .in("event_name", ["location_clicked", "result_clicked", "location_saved", "result_saved"])
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS_PER_SOURCE),
    client
      .from("user_outings")
      .select("status,reservation_id,booked_at,completed_at,created_at,plan_payload,reservation_payload")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS_PER_SOURCE),
  ]);

  if (analyticsResult.error) throw analyticsResult.error;
  if (outingsResult.error) throw outingsResult.error;

  const events: PreferenceEvent[] = [];
  for (const row of analyticsResult.data ?? []) {
    const eventName = String(row.event_name ?? row.event_type ?? "");
    events.push({
      userId,
      type: /saved$/.test(eventName) ? "save" : "click",
      occurredAt: row.created_at,
      ...preferenceFields(row),
    });
  }
  for (const row of outingsResult.data ?? []) {
    const fields = preferenceFields(row);
    events.push({ userId, type: "save", occurredAt: row.created_at, ...fields });
    if (row.reservation_id || row.booked_at) {
      events.push({ userId, type: "reservation", occurredAt: row.booked_at ?? row.created_at, ...fields });
    }
    if (row.completed_at || row.status === "completed") {
      events.push({ userId, type: "completed", occurredAt: row.completed_at ?? row.created_at, ...fields });
    }
  }
  return events;
}

export async function loadUserPreferenceProfile(
  userId: string,
  options: { client?: QueryClient; timeoutMs?: number; now?: Date } = {},
): Promise<UserPreferenceProfile> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const events = await Promise.race([
      queryPreferenceEvidence(userId, options.client),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("profile_load_timeout")), timeoutMs);
      }),
    ]);
    return buildUserPreferenceProfile(userId, events, options.now);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
