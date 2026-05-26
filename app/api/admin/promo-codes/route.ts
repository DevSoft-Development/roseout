import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateUniquePromoCode, normalizePromoCode } from "@/lib/promo-codes";

const validAudiences = ["users", "locations", "both"] as const;
const validTypes = ["premium_access", "search_boost", "location_pro_trial", "discount"] as const;
const validScopes = ["any", "specific_user", "specific_location", "signup_user", "signup_location_owner"] as const;

const toNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const toNumber = (v: unknown) => { const clean = toNull(v); if (clean === null || clean === undefined) return null; const n = Number(clean); return Number.isFinite(n) ? n : null; };
const toIso = (v: unknown) => { const clean = toNull(v); if (typeof clean !== "string") return null; const d = new Date(clean); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function sanitizePromoPayload(body: Record<string, unknown>) {
  const target_scope = body.target_scope ?? "any";
  const scopedUser = target_scope === "specific_user" ? toNull(body.assigned_user_id) : null;
  const scopedLocation = target_scope === "specific_location" ? toNull(body.assigned_location_id) : null;
  const signupContext = String(target_scope).includes("signup") ? toNull(body.signup_context) : null;
  return { code: typeof body.code === "string" ? normalizePromoCode(body.code) : null, name: toNull(body.name), description: toNull(body.description), audience: body.audience, promo_type: body.promo_type, plan_granted: toNull(body.plan_granted), duration_days: toNumber(body.duration_days), search_limit_override: toNumber(body.search_limit_override), discount_percent: toNumber(body.discount_percent), discount_amount: toNumber(body.discount_amount), max_redemptions: toNumber(body.max_redemptions), max_redemptions_per_user: toNumber(body.max_redemptions_per_user) ?? 1, starts_at: toIso(body.starts_at) ?? new Date().toISOString(), expires_at: toIso(body.expires_at), is_active: typeof body.is_active === "boolean" ? body.is_active : true, target_scope, assigned_user_id: scopedUser, assigned_location_id: scopedLocation, assigned_location_name: scopedLocation ? toNull(body.assigned_location_name) : null, signup_context: signupContext, auto_generated: Boolean(body.auto_generated), internal_notes: toNull(body.internal_notes) };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]); if (auth.error) return auth.error;
  const params = request.nextUrl.searchParams; const lookup = params.get("lookup"); const q = params.get("q")?.trim() ?? "";
  if (lookup === "users") { const { data, error } = await supabaseAdmin.from("profiles").select("id, full_name, email").or(`full_name.ilike.%${q}%,email.ilike.%${q}%`).limit(20); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ users: data ?? [] }); }
  if (lookup === "locations") { const { data, error } = await supabaseAdmin.from("locations").select("id, name, address, neighborhood, borough").or(`name.ilike.%${q}%,address.ilike.%${q}%,neighborhood.ilike.%${q}%,borough.ilike.%${q}%`).limit(20); if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ locations: data ?? [] }); }

  const search = q || undefined; const audience = params.get("audience"); const promoType = params.get("promo_type"); const status = params.get("status"); const now = new Date().toISOString();
  let query = supabaseAdmin.from("promo_codes").select("*").order("created_at", { ascending: false });
  if (search) query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
  if (audience && validAudiences.includes(audience as never)) query = query.eq("audience", audience);
  if (promoType && validTypes.includes(promoType as never)) query = query.eq("promo_type", promoType);
  if (status === "inactive") query = query.eq("is_active", false);
  if (status === "expired") query = query.lt("expires_at", now);
  if (status === "scheduled") query = query.gt("starts_at", now);
  if (status === "active") query = query.eq("is_active", true).lte("starts_at", now).or(`expires_at.is.null,expires_at.gte.${now}`);
  const { data, error } = await query; if (error) return NextResponse.json({ error: error.message }, { status: 500 }); return NextResponse.json({ promo_codes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]); if (auth.error) return auth.error;
  const body = (await request.json()) as Record<string, unknown>; const payload = sanitizePromoPayload(body);
  if (!validAudiences.includes(payload.audience as never)) return NextResponse.json({ error: "Invalid audience." }, { status: 400 });
  if (!validTypes.includes(payload.promo_type as never)) return NextResponse.json({ error: "Invalid promo_type." }, { status: 400 });
  if (!validScopes.includes(payload.target_scope as never)) return NextResponse.json({ error: "Invalid target_scope." }, { status: 400 });
  if (!payload.code && !payload.auto_generated) return NextResponse.json({ error: "Code is required." }, { status: 400 });
  if (payload.auto_generated) payload.code = await generateUniquePromoCode(typeof body.prefix === "string" ? body.prefix : "OUT");
  if (payload.target_scope === "specific_user" && !payload.assigned_user_id) return NextResponse.json({ error: "Select a specific user." }, { status: 400 });
  if (payload.target_scope === "specific_location" && !payload.assigned_location_id) return NextResponse.json({ error: "Select a specific location." }, { status: 400 });
  if (payload.discount_percent !== null && (payload.discount_percent < 0 || payload.discount_percent > 100)) return NextResponse.json({ error: "Percent discount must be 0-100." }, { status: 400 });
  if (payload.max_redemptions !== null && payload.max_redemptions < 0) return NextResponse.json({ error: "max_redemptions cannot be negative." }, { status: 400 });
  if (payload.expires_at && new Date(payload.expires_at).getTime() <= new Date(payload.starts_at).getTime()) return NextResponse.json({ error: "Expiration must be after start." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("promo_codes").insert({ ...payload, created_by: auth.adminUser?.id ?? null }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ promo_code: data });
}
