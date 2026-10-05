import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { createCheckCardPayment } from "@/lib/pos/payments/check-payment-service";

export const dynamic = "force-dynamic";

function statusForError(message: string) {
  if (message === "pos_check_not_found") return 404;
  if (message === "pos_check_not_payable" || message === "pos_check_already_paid") return 409;
  if (message === "pos_stripe_connect_not_configured" || message === "pos_stripe_connect_charges_not_enabled") return 409;
  if (message.startsWith("invalid_") || message.startsWith("missing_")) return 400;
  return 500;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ checkId: string }> },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = String(body.location_id || body.locationId || "").trim();
    const { checkId } = await context.params;
    if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
    if (!checkId) return NextResponse.json({ error: "Missing check." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const authorized = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
    if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await createCheckCardPayment({
      location: authorized.location,
      checkId,
      tipCents: Number(body.tip_cents ?? body.tipCents ?? 0),
      staffProfileId: body.staff_profile_id || body.staffProfileId || null,
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create POS payment.";
    return NextResponse.json({ error: message }, { status: statusForError(message) });
  }
}
