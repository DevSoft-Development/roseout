import { createBrowserClient } from "@supabase/ssr";
import type { AuthChangeEvent, Session, SupabaseClient } from "@supabase/supabase-js";

const SESSION_STARTED_AT_KEY = "theouthaven_session_started_at";
const SESSION_MAX_AGE_FALLBACK_HOURS = 12;
const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

type BrowserSupabaseClient = SupabaseClient;

let browserClient: BrowserSupabaseClient | null = null;
let sessionGuardStarted = false;

function getSessionMaxAgeMs() {
  const configured = Number(process.env.NEXT_PUBLIC_AUTH_SESSION_HOURS || "");
  const hours = Number.isFinite(configured) && configured > 0 ? configured : SESSION_MAX_AGE_FALLBACK_HOURS;
  return hours * 60 * 60 * 1000;
}

function safeGetSessionStartedAt() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_STARTED_AT_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function safeSetSessionStartedAt(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STARTED_AT_KEY, String(value));
}

function safeClearSessionStartedAt() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_STARTED_AT_KEY);
}

function getCurrentReturnPath() {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function shouldRedirectToLogin() {
  if (typeof window === "undefined") return false;
  return ["/admin", "/user", "/business/claim", "/locations/dashboard", "/owner"].some((prefix) =>
    window.location.pathname.startsWith(prefix),
  );
}

function startSessionGuard(client: BrowserSupabaseClient) {
  if (typeof window === "undefined" || sessionGuardStarted) return;
  sessionGuardStarted = true;

  async function enforceSessionAge() {
    const { data } = await client.auth.getSession();
    const session = data.session;

    if (!session?.user) {
      safeClearSessionStartedAt();
      return;
    }

    const now = Date.now();
    const startedAt = safeGetSessionStartedAt();

    if (!startedAt) {
      safeSetSessionStartedAt(now);
      return;
    }

    if (now - startedAt > getSessionMaxAgeMs()) {
      safeClearSessionStartedAt();
      await client.auth.signOut();
      if (shouldRedirectToLogin()) {
        window.location.assign(`/login?next=${encodeURIComponent(getCurrentReturnPath())}`);
      }
    }
  }

  void enforceSessionAge();

  client.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
    if (event === "SIGNED_OUT" || !session?.user) {
      safeClearSessionStartedAt();
      return;
    }

    if (event === "SIGNED_IN" || !safeGetSessionStartedAt()) {
      safeSetSessionStartedAt(Date.now());
    }
  });

  window.setInterval(() => {
    void enforceSessionAge();
  }, SESSION_CHECK_INTERVAL_MS);
}

export function createClient(): BrowserSupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    ) as BrowserSupabaseClient;
    startSessionGuard(browserClient);
  }

  return browserClient;
}
