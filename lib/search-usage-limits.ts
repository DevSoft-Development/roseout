import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminLoginRole } from "@/lib/auth/get-admin-login-role";

export const DEFAULT_SEARCH_LIMITS = {
  enabled: false,
  guestWeeklyLimit: 1,
  freeUserWeeklyLimit: 3,
  paidUserWeeklyLimit: null,
  betaUsersUnlimited: true,
  adminUsersUnlimited: true,
  window: "weekly",
  limitMode: "hard",
  upgradeCtaEnabled: true,
};

const SEARCH_IDENTITY_AUTH_TIMEOUT_MS = 1200;

export async function getSearchUsageSettings() {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "search_usage_limits")
      .maybeSingle();
    return { ...DEFAULT_SEARCH_LIMITS, ...(data?.value || {}) };
  } catch {
    return DEFAULT_SEARCH_LIMITS;
  }
}

function guestSearchIdentity(cookieGuest: string | null) {
  return {
    user: null,
    guestId: cookieGuest || randomUUID(),
    setGuestCookie: !cookieGuest,
  };
}

async function withIdentityAuthTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("search_identity_auth_timeout")),
      SEARCH_IDENTITY_AUTH_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getCurrentSearchIdentity(req: NextRequest | Request) {
  const headers = (req as any).headers;
  const cookieHeader = headers.get?.("cookie") || "";
  const cookieGuest =
    /guest_search_id=([^;]+)/.exec(cookieHeader)?.[1] || null;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return (req as NextRequest).cookies?.getAll?.() || [];
        },
        setAll() {},
      },
    },
  );
  const auth = headers.get?.("authorization")?.replace(/^Bearer\s+/i, "");

  try {
    const userResult = await withIdentityAuthTimeout(
      auth
        ? supabase.auth.getUser(auth)
        : supabase.auth.getUser(),
    );
    const user = userResult.data.user;
    return {
      user,
      guestId: user ? null : cookieGuest || randomUUID(),
      setGuestCookie: !user && !cookieGuest,
    };
  } catch (error) {
    console.warn("[search-identity] auth unavailable; continuing as guest", {
      reason:
        error instanceof Error ? error.message : "search_identity_auth_error",
    });
    return guestSearchIdentity(cookieGuest);
  }
}

export async function resolveSearchPlan(user: any) {
  if (!user)
    return {
      planKey: "guest",
      unlimited: false,
      isBeta: false,
      isAdmin: false,
    };
  const isAdmin = Boolean(
    await getAdminLoginRole(supabaseAdmin as any, {
      id: user.id,
      email: user.email ?? null,
    }).catch(() => null),
  );
  let isBeta = false;
  try {
    const { data } = await supabaseAdmin
      .from("beta_testers")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["active", "approved"])
      .limit(1);
    isBeta = Boolean(data?.length);
  } catch {}
  let planKey = "free";
  try {
    const { data } = await supabaseAdmin
      .from("customer_subscriptions")
      .select("plan_key,status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    planKey = data?.[0]?.plan_key || "free";
  } catch {}
  return {
    planKey,
    isBeta,
    isAdmin,
    unlimited:
      isAdmin ||
      isBeta ||
      ["unlimited", "comped", "admin"].includes(planKey),
  };
}

export async function getWeeklySearchUsageCount(identity: {
  user: any;
  guestId: string | null;
}) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  let q = supabaseAdmin
    .from("search_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("allowed", true)
    .gte("created_at", since.toISOString());
  q = identity.user
    ? q.eq("auth_user_id", identity.user.id)
    : q.eq("guest_id", identity.guestId);
  const { count } = await q;
  return count || 0;
}

export async function checkSearchLimit(identity: any, query: string | null) {
  const settings = await getSearchUsageSettings();

  // Limits are normally disabled during launch/beta. Do not put plan, admin,
  // subscription, or usage-count database calls on the critical search path
  // when they cannot affect whether the request is allowed.
  if (!settings.enabled) {
    return {
      allowed: true,
      settings,
      plan: {
        planKey: identity.user ? "free" : "guest",
        unlimited: false,
        isBeta: false,
        isAdmin: false,
      },
      usedThisWeek: 0,
      weeklyLimit: null,
      message: null,
    };
  }

  const plan = await resolveSearchPlan(identity.user);
  const used = await getWeeklySearchUsageCount(identity);
  const weeklyLimit =
    plan.unlimited ||
    (plan.isBeta && settings.betaUsersUnlimited) ||
    (plan.isAdmin && settings.adminUsersUnlimited)
      ? null
      : plan.planKey === "guest"
        ? settings.guestWeeklyLimit
        : settings.freeUserWeeklyLimit;
  const allowed = weeklyLimit == null || used < Number(weeklyLimit);
  return {
    allowed,
    settings,
    plan,
    usedThisWeek: used,
    weeklyLimit,
    message: !allowed
      ? plan.planKey === "guest"
        ? "You’ve used your free search for this week. Create a free account to get 3 searches per week, or upgrade for unlimited searches."
        : "You’ve used your 3 free searches for this week. Upgrade to TheOutHaven Plus for unlimited searches."
      : null,
  };
}

export async function recordSearchUsageEvent(input: {
  identity: any;
  query?: string | null;
  allowed: boolean;
  reason?: string | null;
  planKey?: string | null;
}) {
  try {
    await supabaseAdmin.from("search_usage_events").insert({
      auth_user_id: input.identity.user?.id ?? null,
      guest_id: input.identity.guestId ?? null,
      query: input.query ?? null,
      allowed: input.allowed,
      limit_reason: input.reason ?? null,
      plan_key: input.planKey ?? null,
    });
  } catch (e) {
    console.warn("search usage record failed", e);
  }
}
