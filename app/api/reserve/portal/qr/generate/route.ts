import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureLocationQrFields } from "@/lib/qr/locationQr";
import { requireReservePermission } from "@/lib/reserve/locationPermissions";

function canonicalLocationId(auth: any, fallback: string) {
  return String(auth.access?.location?.id || fallback);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const locationId = String(body.locationId || "");
  const auth = await requireReservePermission(locationId, "manageQrCodes");
  if (auth.error) return auth.error;
  const resolvedLocationId = canonicalLocationId(auth, locationId);
  const { data: loc } = await supabaseAdmin.from("locations").select("*").eq("id", resolvedLocationId).maybeSingle();
  if (!loc) return NextResponse.json({ success: false, error: "Location not found." }, { status: 404 });
  const updates = await ensureLocationQrFields(loc);
  if (Object.keys(updates).length) await supabaseAdmin.from("locations").update(updates).eq("id", resolvedLocationId);
  return NextResponse.json({ success: true, message: "QR codes are ready.", updated: Object.keys(updates) });
}
