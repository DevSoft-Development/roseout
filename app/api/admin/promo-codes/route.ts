import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniquePromoCode, normalizePromoCode } from "@/lib/promo-codes";

const validAudiences = ["users", "locations", "both"] as const;
const validTypes = ["premium_access", "search_boost", "location_pro_trial", "discount"] as const;
const validScopes = ["any", "specific_user", "specific_location", "signup_user", "signup_location_owner"] as const;

const toNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const toNumber = (v: unknown) => {
  const clean = toNull(v);
  if (clean === null || clean === undefined) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

function sanitizePromoPayload(body: Record<string, unknown>) {
  return {
    code: typeof body.code === "string" ? normalizePromoCode(body.code) : null,
    name: toNull(body.name),
    description: toNull(body.description),
    audience: body.audience,
    promo_type: body.promo_type,
    plan_granted: toNull(body.plan_granted),
    duration_days: toNumber(body.duration_days),
    search_limit_override: toNumber(body.search_limit_override),
    discount_percent: toNumber(body.discount_percent),
    discount_amount: toNumber(body.discount_amount),
    max_redemptions: toNumber(body.max_redemptions),
    max_redemptions_per_user: toNumber(body.max_redemptions_per_user) ?? 1,
    starts_at: toNull(body.starts_at) ?? new Date().toISOString(),
    expires_at: toNull(body.expires_at),
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    target_scope: body.target_scope ?? "any",
    assigned_user_id: toNull(body.assigned_user_id),
    assigned_location_id: toNull(body.assigned_location_id),
    assigned_location_name: toNull(body.assigned_location_name),
    signup_context: toNull(body.signup_context),
    auto_generated: Boolean(body.auto_generated),
    internal_notes: toNull(body.internal_notes),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const params = request.nextUrl.searchParams;
  const search = params.get("q")?.trim();
  const audience = params.get("audience");
  const promoType = params.get("promo_type");
  const status = params.get("status");
  const now = new Date().toISOString();

  let query = supabaseAdmin.from("promo_codes").select("*").order("created_at", { ascending: false });
  if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
  if (audience && validAudiences.includes(audience as (typeof validAudiences)[number])) query = query.eq("audience", audience);
  if (promoType && validTypes.includes(promoType as (typeof validTypes)[number])) query = query.eq("promo_type", promoType);
  if (status === "inactive") query = query.eq("is_active", false);
  if (status === "expired") query = query.lt("expires_at", now);
  if (status === "scheduled") query = query.gt("starts_at", now);
  if (status === "active") query = query.eq("is_active", true).lte("starts_at", now).or(`expires_at.is.null,expires_at.gte.${now}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promo_codes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]);
  if (auth.error) return auth.error;
  const body = (await request.json()) as Record<string, unknown>;
  const payload = sanitizePromoPayload(body);

  if (!validAudiences.includes(payload.audience as (typeof validAudiences)[number])) return NextResponse.json({ error: "Invalid audience." }, { status: 400 });
  if (!validTypes.includes(payload.promo_type as (typeof validTypes)[number])) return NextResponse.json({ error: "Invalid promo_type." }, { status: 400 });
  if (!validScopes.includes(payload.target_scope as (typeof validScopes)[number])) return NextResponse.json({ error: "Invalid target_scope." }, { status: 400 });

  if (!payload.code && !payload.auto_generated) return NextResponse.json({ error: "Code is required unless auto_generate is true." }, { status: 400 });
  if (payload.auto_generated) payload.code = await generateUniquePromoCode(typeof body.prefix === "string" ? body.prefix : "OUT");

  if (payload.target_scope === "specific_user" && !payload.assigned_user_id) return NextResponse.json({ error: "assigned_user_id is required for specific_user." }, { status: 400 });
  if (payload.target_scope === "specific_location" && !payload.assigned_location_id) return NextResponse.json({ error: "assigned_location_id is required for specific_location." }, { status: 400 });
  if (payload.target_scope === "signup_user" && !["users", "both"].includes(payload.audience as string)) return NextResponse.json({ error: "signup_user requires users or both audience." }, { status: 400 });
  if (payload.target_scope === "signup_location_owner" && !["locations", "both"].includes(payload.audience as string)) return NextResponse.json({ error: "signup_location_owner requires locations or both audience." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("promo_codes").insert({ ...payload, created_by: auth.adminUser?.id ?? null }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ promo_code: data });
}
