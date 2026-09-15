type ClientTrackEventInput = {
  event_name: string;
  anonymous_id?: string | null;
  session_id?: string | null;
  search_id?: string | null;
  query_fingerprint?: string | null;
  pair_id?: string | null;
  location_id?: string | null;
  source_location_id?: string | null;
  query?: string | null;
  normalized_query?: string | null;
  ranking_position?: number | null;
  result_count?: number | null;
  response_time_ms?: number | null;
  source?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  location_type?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown>;
};

type ActiveSearchContext = {
  search_id: string | null;
  query: string | null;
  normalized_query: string | null;
  source: string | null;
};

type ActivePromotionContext = {
  campaign_id: string;
  placement: "discover" | "search";
  touched_at: number;
};

const ANONYMOUS_KEY = "theouthaven_analytics_anonymous_id";
const SESSION_KEY = "theouthaven_analytics_session_id";
const ACTIVE_SEARCH_KEY = "theouthaven_analytics_active_search";
const ACTIVE_PROMOTION_KEY = "theouthaven_active_promotion";
const PROMOTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function randomId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `fallback-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function persistedId(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const id = randomId();
    storage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
}

export function getAnalyticsIdentity() {
  if (typeof window === "undefined") return { anonymous_id: null, session_id: null };
  let local: Storage | undefined;
  let session: Storage | undefined;
  try { local = window.localStorage; } catch {}
  try { session = window.sessionStorage; } catch {}
  return { anonymous_id: persistedId(local, ANONYMOUS_KEY), session_id: persistedId(session, SESSION_KEY) };
}

function getActiveSearchContext(): ActiveSearchContext {
  if (typeof window === "undefined") return { search_id: null, query: null, normalized_query: null, source: null };
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SEARCH_KEY);
    if (!raw) return { search_id: null, query: null, normalized_query: null, source: null };
    const parsed = JSON.parse(raw) as Partial<ActiveSearchContext>;
    return {
      search_id: typeof parsed.search_id === "string" ? parsed.search_id : null,
      query: typeof parsed.query === "string" ? parsed.query : null,
      normalized_query: typeof parsed.normalized_query === "string" ? parsed.normalized_query : null,
      source: typeof parsed.source === "string" ? parsed.source : null,
    };
  } catch {
    return { search_id: null, query: null, normalized_query: null, source: null };
  }
}

function persistActiveSearchContext(input: ClientTrackEventInput) {
  if (typeof window === "undefined" || !input.search_id) return;
  try {
    const current = getActiveSearchContext();
    const next: ActiveSearchContext = { search_id: input.search_id, query: input.query ?? current.query, normalized_query: input.normalized_query ?? current.normalized_query, source: input.source ?? current.source };
    window.sessionStorage.setItem(ACTIVE_SEARCH_KEY, JSON.stringify(next));
  } catch {}
}

export function rememberPromotionContext(campaignId: string, placement: "discover" | "search") {
  if (typeof window === "undefined" || !campaignId) return;
  try {
    const value: ActivePromotionContext = { campaign_id: campaignId, placement, touched_at: Date.now() };
    window.localStorage.setItem(ACTIVE_PROMOTION_KEY, JSON.stringify(value));
  } catch {}
}

function activePromotionContext(): ActivePromotionContext | null {
  if (typeof window === "undefined") return null;
  try {
    const urlCampaign = new URLSearchParams(window.location.search).get("promo")?.trim();
    if (urlCampaign) rememberPromotionContext(urlCampaign, "discover");
    const raw = window.localStorage.getItem(ACTIVE_PROMOTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActivePromotionContext>;
    if (!parsed.campaign_id || (parsed.placement !== "discover" && parsed.placement !== "search") || !parsed.touched_at || Date.now() - parsed.touched_at > PROMOTION_WINDOW_MS) {
      window.localStorage.removeItem(ACTIVE_PROMOTION_KEY);
      return null;
    }
    return parsed as ActivePromotionContext;
  } catch {
    return null;
  }
}

function getDeviceHints() {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent || "";
  return {
    browser: ua.includes("Chrome") ? "chrome" : ua.includes("Safari") ? "safari" : "other",
    os: ua.includes("Windows") ? "windows" : ua.includes("Mac") ? "macos" : ua.includes("Linux") ? "linux" : "other",
    device_type: /Mobi|Android/i.test(ua) ? "mobile" : "desktop",
  };
}

function postPromotionEvent(campaignId: string, placement: "discover" | "search", eventType: string, sessionId: string | null, input: ClientTrackEventInput) {
  void fetch("/api/promotions/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      campaign_id: campaignId,
      event_type: eventType,
      placement,
      session_key: sessionId,
      conversion_id: String(input.metadata?.reservation_id || input.metadata?.booking_id || input.metadata?.outing_id || "") || null,
      revenue_cents: Number.isFinite(Number(input.metadata?.revenue_cents)) ? Number(input.metadata?.revenue_cents) : null,
      metadata: {
        analytics_event_name: input.event_name,
        location_id: input.location_id || input.metadata?.location_id || null,
        restaurant_id: input.metadata?.restaurant_id || null,
        activity_id: input.metadata?.activity_id || null,
        plan_type: input.metadata?.plan_type || null,
        rank: input.metadata?.rank || null,
      },
    }),
  });
}

function promotionConversionType(eventName: string) {
  const name = eventName.toLowerCase();
  if (/completed[_-]?outing|outing[_-]?completed/.test(name)) return "completed_outing";
  if (/booking[_-]?(confirmed|completed)|reservation[_-]?(confirmed|booked)/.test(name)) return "booking";
  if (/reservation[_-]?(click|opened)|reserve[_-]?(click|opened)/.test(name)) return "reservation_click";
  if (/call[_-]?(click|started)|phone[_-]?click/.test(name)) return "call";
  if (/save|saved/.test(name)) return "save";
  return null;
}

function mirrorPromotionEvent(input: ClientTrackEventInput, sessionId: string | null) {
  if (input.event_name === "planner_plan_selected" && input.metadata?.sponsored === true) {
    const campaignId = String(input.metadata?.sponsor_id || "").trim();
    if (!campaignId) return;
    rememberPromotionContext(campaignId, "search");
    postPromotionEvent(campaignId, "search", "outing_open", sessionId, input);
    return;
  }

  const context = activePromotionContext();
  if (!context) return;
  const conversionType = promotionConversionType(input.event_name);
  if (!conversionType) return;
  postPromotionEvent(context.campaign_id, context.placement, conversionType, sessionId, input);
}

export function trackClientEvent(input: ClientTrackEventInput) {
  try {
    persistActiveSearchContext(input);
    const activeSearch = getActiveSearchContext();
    const identity = getAnalyticsIdentity();
    const payload = {
      ...identity,
      ...activeSearch,
      ...input,
      page_path: typeof window !== "undefined" ? window.location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      ...getDeviceHints(),
    };

    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(payload),
    });
    mirrorPromotionEvent(input, identity.session_id);
  } catch {}
}
