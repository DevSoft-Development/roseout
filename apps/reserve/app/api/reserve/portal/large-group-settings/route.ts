import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";

function cleanId(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

async function requireAccess(locationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Please log in." }, { status: 401 }) };
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return { error: NextResponse.json({ error: "You do not have access to this location." }, { status: 403 }) };
  return { user };
}

const SELECT = "id,name,restaurant_name,activity_name,large_group_booking_enabled,large_group_min_party_size,large_group_max_party_size,large_group_confirmation_mode,large_group_payment_mode,large_group_deposit_type,large_group_deposit_amount_cents,large_group_prix_fixe_mode,large_group_default_duration_minutes,large_group_cancel_cutoff_hours,large_group_no_show_grace_minutes,large_group_late_cancel_fee_type,large_group_late_cancel_fee_cents,large_group_no_show_fee_type,large_group_no_show_fee_cents,reservation_guarantee_enabled,reservation_cancel_cutoff_hours,reservation_no_show_grace_minutes,reservation_late_cancel_fee_type,reservation_late_cancel_fee_cents,reservation_no_show_fee_type,reservation_no_show_fee_cents,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled";

export async function GET(request: NextRequest) {
  const locationId = cleanId(new URL(request.url).searchParams.get("locationId"));
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const access = await requireAccess(locationId);
  if (access.error) return access.error;
  const { data, error } = await supabaseAdmin.from("locations").select(SELECT).eq("id", locationId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  return NextResponse.json({
    location: data,
    stripeReady: Boolean(data.stripe_connect_account_id && data.stripe_connect_charges_enabled && data.stripe_connect_payouts_enabled),
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const locationId = cleanId(body.locationId || body.location_id);
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const access = await requireAccess(locationId);
  if (access.error) return access.error;

  const currentResult = await supabaseAdmin.from("locations").select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled").eq("id", locationId).maybeSingle();
  if (currentResult.error) return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
  if (!currentResult.data) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const paymentMode = ["none", "card_guarantee", "deposit"].includes(String(body.large_group_payment_mode)) ? String(body.large_group_payment_mode) : "none";
  const stripeReady = Boolean(currentResult.data.stripe_connect_account_id && currentResult.data.stripe_connect_charges_enabled && currentResult.data.stripe_connect_payouts_enabled);
  if (["deposit", "card_guarantee"].includes(paymentMode) && !stripeReady) {
    return NextResponse.json({ error: "Complete Stripe onboarding before requiring large-group payment protection." }, { status: 409 });
  }

  const minParty = Math.max(2, Math.min(500, Number(body.large_group_min_party_size || 8)));
  const maxParty = Math.max(minParty, Math.min(500, Number(body.large_group_max_party_size || 40)));
  const update = {
    large_group_booking_enabled: Boolean(body.large_group_booking_enabled),
    large_group_min_party_size: minParty,
    large_group_max_party_size: maxParty,
    large_group_confirmation_mode: ["instant", "approval"].includes(String(body.large_group_confirmation_mode)) ? String(body.large_group_confirmation_mode) : "approval",
    large_group_payment_mode: paymentMode,
    large_group_deposit_type: ["flat", "per_person"].includes(String(body.large_group_deposit_type)) ? String(body.large_group_deposit_type) : "flat",
    large_group_deposit_amount_cents: Math.max(0, Math.round(Number(body.large_group_deposit_amount_cents || 0))),
    large_group_prix_fixe_mode: ["none", "optional", "required"].includes(String(body.large_group_prix_fixe_mode)) ? String(body.large_group_prix_fixe_mode) : "optional",
    large_group_default_duration_minutes: Math.max(30, Math.min(1440, Math.round(Number(body.large_group_default_duration_minutes || 180)))),
    large_group_cancel_cutoff_hours: Math.max(0, Math.min(336, Math.round(Number(body.large_group_cancel_cutoff_hours ?? 24)))),
    large_group_no_show_grace_minutes: Math.max(0, Math.min(180, Math.round(Number(body.large_group_no_show_grace_minutes ?? 15)))),
    large_group_late_cancel_fee_type: ["flat", "per_person"].includes(String(body.large_group_late_cancel_fee_type)) ? String(body.large_group_late_cancel_fee_type) : "per_person",
    large_group_late_cancel_fee_cents: Math.max(0, Math.round(Number(body.large_group_late_cancel_fee_cents ?? 2500))),
    large_group_no_show_fee_type: ["flat", "per_person"].includes(String(body.large_group_no_show_fee_type)) ? String(body.large_group_no_show_fee_type) : "per_person",
    large_group_no_show_fee_cents: Math.max(0, Math.round(Number(body.large_group_no_show_fee_cents ?? 5000))),
    reservation_guarantee_enabled: Boolean(body.reservation_guarantee_enabled),
    reservation_cancel_cutoff_hours: Math.max(0, Math.min(168, Math.round(Number(body.reservation_cancel_cutoff_hours ?? 6)))),
    reservation_no_show_grace_minutes: Math.max(0, Math.min(180, Math.round(Number(body.reservation_no_show_grace_minutes ?? 15)))),
    reservation_late_cancel_fee_type: ["flat", "per_person"].includes(String(body.reservation_late_cancel_fee_type)) ? String(body.reservation_late_cancel_fee_type) : "per_person",
    reservation_late_cancel_fee_cents: Math.max(0, Math.round(Number(body.reservation_late_cancel_fee_cents ?? 1000))),
    reservation_no_show_fee_type: ["flat", "per_person"].includes(String(body.reservation_no_show_fee_type)) ? String(body.reservation_no_show_fee_type) : "per_person",
    reservation_no_show_fee_cents: Math.max(0, Math.round(Number(body.reservation_no_show_fee_cents ?? 2000))),
    updated_at: new Date().toISOString(),
  };
  if (update.large_group_payment_mode === "deposit" && update.large_group_deposit_amount_cents < 50) {
    return NextResponse.json({ error: "Large-group deposits must be at least $0.50." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("locations").update(update).eq("id", locationId).select(SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, location: data, stripeReady });
}
