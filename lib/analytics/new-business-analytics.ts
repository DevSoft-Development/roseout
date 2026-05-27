import "server-only";

export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all";

export type AnalyticsEventRow = {
  id?: string;
  event_name?: string | null;
  event_type?: string | null;
  location_id?: string | null;
  outing_id?: string | null;
  user_id?: string | null;
  source?: string | null;
  page_path?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string | null;
};

export type OutingRow = {
  id?: string;
  location_id?: string | null;
  source_location_id?: string | null;
  status?: string | null;
  contact_method?: string | null;
  reservation_type?: string | null;
  reservation_clicked_at?: string | null;
  call_clicked_at?: string | null;
  completed_at?: string | null;
  rating?: number | null;
  matched_vibe?: boolean | null;
  would_go_again?: boolean | null;
  created_at?: string | null;
};

export type AnalyticsLocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  city?: string | null;
  state?: string | null;
  is_pro?: boolean | null;
  owner_user_id?: string | null;
  owner_email?: string | null;
  claimed_by_email?: string | null;
};

export function rangeToStartIso(range: AnalyticsRange) {
  if (range === "all") return null;
  const days: Record<Exclude<AnalyticsRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days[range]);
  return date.toISOString();
}

export function normalizeEventName(event: AnalyticsEventRow) {
  return (
    event.event_name ||
    event.event_type ||
    event.metadata?.event_name ||
    event.metadata?.event_type ||
    ""
  ).toString();
}

export function outingLocationId(outing: OutingRow) {
  return outing.location_id || outing.source_location_id || null;
}

export function average(values: Array<number | null | undefined>) {
  const filtered = values.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return filtered.length ? filtered.reduce((a, b) => a + b, 0) / filtered.length : 0;
}
