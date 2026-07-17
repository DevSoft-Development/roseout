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

const ANONYMOUS_KEY = "theouthaven_analytics_anonymous_id";
const SESSION_KEY = "theouthaven_analytics_session_id";
const ACTIVE_SEARCH_KEY = "theouthaven_analytics_active_search";

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
  try {
    local = window.localStorage;
  } catch {}
  try {
    session = window.sessionStorage;
  } catch {}

  return {
    anonymous_id: persistedId(local, ANONYMOUS_KEY),
    session_id: persistedId(session, SESSION_KEY),
  };
}

function getActiveSearchContext(): ActiveSearchContext {
  if (typeof window === "undefined") {
    return { search_id: null, query: null, normalized_query: null, source: null };
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SEARCH_KEY);
    if (!raw) {
      return { search_id: null, query: null, normalized_query: null, source: null };
    }

    const parsed = JSON.parse(raw) as Partial<ActiveSearchContext>;
    return {
      search_id: typeof parsed.search_id === "string" ? parsed.search_id : null,
      query: typeof parsed.query === "string" ? parsed.query : null,
      normalized_query:
        typeof parsed.normalized_query === "string" ? parsed.normalized_query : null,
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
    const next: ActiveSearchContext = {
      search_id: input.search_id,
      query: input.query ?? current.query,
      normalized_query: input.normalized_query ?? current.normalized_query,
      source: input.source ?? current.source,
    };
    window.sessionStorage.setItem(ACTIVE_SEARCH_KEY, JSON.stringify(next));
  } catch {
    // Storage failures must never affect analytics or the user flow.
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

export function trackClientEvent(input: ClientTrackEventInput) {
  try {
    persistActiveSearchContext(input);
    const activeSearch = getActiveSearchContext();
    const payload = {
      ...getAnalyticsIdentity(),
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
  } catch {
    // Analytics must never interrupt the user flow.
  }
}
