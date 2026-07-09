import { NextResponse } from "next/server";
import { ensureLocationQrFields } from "@/lib/qr/locationQr";
import { getReserveCanonicalLocationId, requireReservePermission } from "@/lib/reserve/locationPermissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type ReserveQrMode = "generate" | "regenerate";

export async function ensureReserveLocationQrFields(locationId: string, mode: ReserveQrMode = "generate") {
  const auth = await requireReservePermission(locationId, "manageQrCodes");
  if (auth.error) return auth.error;

  const resolvedLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const { data: loc } = await supabaseAdmin.from("locations").select("*").eq("id", resolvedLocationId).maybeSingle();
  if (!loc) return NextResponse.json({ success: false, error: "Location not found." }, { status: 404 });

  const updates = await ensureLocationQrFields(loc);
  if (Object.keys(updates).length) {
    await supabaseAdmin.from("locations").update(updates).eq("id", resolvedLocationId);
  }

  return NextResponse.json({
    success: true,
    message: mode === "regenerate"
      ? "QR codes are ready. Regeneration is compatibility-safe and only fills missing/current QR fields."
      : "QR codes are ready.",
    behavior: mode === "regenerate" ? "ensure-current" : "ensure-current",
    locationId: resolvedLocationId,
    updated: Object.keys(updates),
  });
}
