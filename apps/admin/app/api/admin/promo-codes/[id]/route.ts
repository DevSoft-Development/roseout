import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { normalizePromoCode } from "@/lib/promo-codes";

const validAudiences = ["users", "locations", "both"] as const;
const validTypes = ["premium_access", "search_boost", "location_pro_trial", "discount"] as const;
const validScopes = ["any", "specific_user", "specific_location", "signup_user", "signup_location_owner"] as const;
const PROMO_DETAIL_FIELDS = "id,code,name,description,audience,promo_type,plan_granted,duration_days,search_limit_override,discount_percent,discount_amount,max_redemptions,redemption_count,max_redemptions_per_user,starts_at,expires_at,is_active,target_scope,assigned_user_id,assigned_location_id,assigned_location_name,signup_context,auto_generated,internal_notes,created_at,updated_at";

const bounded = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) || null : null;
const numberOrNull = (value: unknown) => value === null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const isoOrNull = (value: unknown) => {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

function buildPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  if ("code" in body && typeof body.code === "string") patch.code = normalizePromoCode(body.code).slice(0, 64);
  if ("name" in body) patch.name = bounded(body.name, 120);
  if ("description" in body) patch.description = bounded(body.description, 1000);
  if ("internal_notes" in body) patch.internal_notes = bounded(body.internal_notes, 2000);
  if ("plan_granted" in body) patch.plan_granted = bounded(body.plan_granted, 80);
  if ("assigned_location_name" in body) patch.assigned_location_name = bounded(body.assigned_location_name, 200);
  if ("signup_context" in body) patch.signup_context = bounded(body.signup_context, 80);
  if ("audience" in body && validAudiences.includes(body.audience as never)) patch.audience = body.audience;
  if ("promo_type" in body && validTypes.includes(body.promo_type as never)) patch.promo_type = body.promo_type;
  if ("target_scope" in body && validScopes.includes(body.target_scope as never)) patch.target_scope = body.target_scope;
  if ("assigned_user_id" in body) patch.assigned_user_id = typeof body.assigned_user_id === "string" && body.assigned_user_id ? body.assigned_user_id : null;
  if ("assigned_location_id" in body) patch.assigned_location_id = typeof body.assigned_location_id === "string" && body.assigned_location_id ? body.assigned_location_id : null;
  for (const key of ["duration_days", "search_limit_override", "discount_percent", "discount_amount", "max_redemptions", "max_redemptions_per_user"] as const) {
    if (key in body) patch[key] = numberOrNull(body[key]);
  }
  if ("starts_at" in body) patch.starts_at = isoOrNull(body.starts_at);
  if ("expires_at" in body) patch.expires_at = isoOrNull(body.expires_at);
  if ("is_active" in body && typeof body.is_active === "boolean") patch.is_active = body.is_active;
  return patch;
}

function validatePatch(patch: Record<string, unknown>) {
  const percent = patch.discount_percent as number | null | undefined;
  if (percent !== undefined && percent !== null && (percent < 0 || percent > 100)) return "Percent discount must be 0-100.";
  const amount = patch.discount_amount as number | null | undefined;
  if (amount !== undefined && amount !== null && amount < 0) return "Discount amount cannot be negative.";
  const duration = patch.duration_days as number | null | undefined;
  if (duration !== undefined && duration !== null && (duration < 0 || duration > 3650)) return "duration_days is out of range.";
  const searchLimit = patch.search_limit_override as number | null | undefined;
  if (searchLimit !== undefined && searchLimit !== null && searchLimit < 0) return "search_limit_override cannot be negative.";
  const max = patch.max_redemptions as number | null | undefined;
  if (max !== undefined && max !== null && max < 0) return "max_redemptions cannot be negative.";
  const perUser = patch.max_redemptions_per_user as number | null | undefined;
  if (perUser !== undefined && perUser !== null && perUser < 1) return "max_redemptions_per_user must be at least 1.";
  return null;
}


const PROMO_CODE_ROLES = ["superadmin"] as const;
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(PROMO_CODE_ROLES);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data, error } = await getAdminDatabaseClient().from("promo_codes").select(PROMO_DETAIL_FIELDS).eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promo_code: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(PROMO_CODE_ROLES);
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json() as Record<string, unknown>;
  const patch = buildPatch(body);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
  const validationError = validatePatch(patch);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  const { data, error } = await getAdminDatabaseClient()
    .from("promo_codes")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(PROMO_DETAIL_FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ promo_code: data });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(PROMO_CODE_ROLES);
  if (auth.error) return auth.error;
  const { id } = await params;
  const { error } = await getAdminDatabaseClient().from("promo_codes").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
