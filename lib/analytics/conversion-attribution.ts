import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";

export const EXTERNAL_EVENT_NAMES = [
  "external_site_session_started",
  "external_page_view",
  "external_menu_view",
  "external_reserve_click",
  "external_call_click",
  "external_directions_click",
  "external_order_click",
  "external_contact_submit",
  "external_event_view",
] as const;

export type ExternalEventName = (typeof EXTERNAL_EVENT_NAMES)[number];

type AttributionRecord = {
  id?: string | null;
  token?: string | null;
  search_id?: string | null;
  search_query?: string | null;
  result_position?: number | null;
  expires_at?: string | null;
};

export function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string | null, allowedOrigins: string[]) {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return allowedOrigins.map(normalizeOrigin).filter(Boolean).includes(normalized);
}

export async function getWebsiteTrackingBySiteKey(siteKey: string) {
  const { data } = await supabaseAdmin
    .from("location_website_tracking")
    .select("location_id,site_key,enabled,allowed_origins,verified_at,last_seen_at,average_customer_value")
    .eq("site_key", siteKey)
    .maybeSingle();
  return data;
}

export async function recordExternalEvent(input: {
  locationId: string;
  eventName: ExternalEventName;
  attributionToken?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  let attribution: AttributionRecord | null = null;
  if (input.attributionToken) {
    const { data } = await supabaseAdmin
      .from("location_attributions")
      .select("id,token,location_id,search_id,search_query,result_position,created_at,expires_at")
      .eq("token", input.attributionToken)
      .eq("location_id", input.locationId)
      .maybeSingle();
    const record = data as AttributionRecord | null;
    if (record?.expires_at && new Date(record.expires_at).getTime() > Date.now()) attribution = record;
  }

  await trackEvent({
    event_name: input.eventName,
    event_type: input.eventName,
    canonical_event_name: input.eventName,
    location_id: input.locationId,
    search_id: attribution?.search_id || null,
    query: attribution?.search_query || null,
    ranking_position: attribution?.result_position ?? null,
    session_id: input.sessionId || null,
    page_path: input.pageUrl || null,
    referrer: input.referrer || null,
    source: "external_website",
    conversion_step: input.eventName,
    metadata: {
      attribution_token: attribution?.token || null,
      attribution_id: attribution?.id || null,
      external_site: true,
      ...(input.metadata || {}),
    },
  });
}

export function buildTrackerSnippet(siteKey: string, origin = "https://theouthaven.com") {
  return `<script async src="${origin}/toh-tracker.js" data-site-key="${siteKey}"></script>`;
}
