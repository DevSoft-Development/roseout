import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getReserveCanonicalLocationId,
  requireReservePermission,
} from "@/lib/reserve/locationPermissions";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function mode(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values.filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ reservationId: string }> }) {
  const { reservationId } = await context.params;
  const locationId = clean(request.nextUrl.searchParams.get("locationId"));
  if (!locationId || !reservationId) return NextResponse.json({ success: false, error: "Missing reservation context." }, { status: 400 });
  const auth = await requireReservePermission(locationId, "viewDashboard");
  if (auth.error) return auth.error;
  const canonicalLocationId = getReserveCanonicalLocationId(auth.access, locationId);
  const reservation = await supabaseAdmin.from("location_reservations").select("*").eq("id", reservationId).eq("location_id", canonicalLocationId).maybeSingle();
  if (reservation.error || !reservation.data) return NextResponse.json({ success: false, error: "Reservation not found." }, { status: 404 });
  const current = reservation.data;
  const phone = clean(current.customer_phone);
  const email = clean(current.customer_email).toLowerCase();
  let historyQuery = supabaseAdmin.from("location_reservations").select("id,status,reservation_date,reservation_time,party_size,bookable_item_name,server_staff_profile_id,created_at,completed_at,special_request,special_requests,notes").eq("location_id", canonicalLocationId).order("reservation_date", { ascending: false }).limit(100);
  if (phone && email) historyQuery = historyQuery.or(`customer_phone.eq.${phone},customer_email.ilike.${email}`);
  else if (phone) historyQuery = historyQuery.eq("customer_phone", phone);
  else if (email) historyQuery = historyQuery.ilike("customer_email", email);
  else historyQuery = historyQuery.eq("customer_name", current.customer_name || "");
  const history = await historyQuery;
  const rows = history.data || [];
  const terminalVisits = rows.filter((row) => ["completed","seated","occupied"].includes(String(row.status || "").toLowerCase()));
  const serverIds = [...new Set(rows.map((row) => row.server_staff_profile_id).filter(Boolean))];
  const servers = serverIds.length ? await supabaseAdmin.from("reserve_staff_profiles").select("id,display_name").in("id", serverIds) : { data: [] } as any;
  const favoriteServerId = mode(terminalVisits.map((row) => row.server_staff_profile_id).filter(Boolean));
  const favoriteServer = (servers.data || []).find((row: any) => row.id === favoriteServerId)?.display_name || null;
  const preferredTable = mode(terminalVisits.map((row) => clean(row.bookable_item_name)).filter(Boolean));
  const averagePartySize = rows.length ? Number((rows.reduce((sum, row) => sum + Math.max(1, Number(row.party_size || 1)), 0) / rows.length).toFixed(1)) : 0;
  const notes = [...new Set(rows.flatMap((row) => [clean(row.special_request), clean(row.special_requests), clean(row.notes)]).filter(Boolean))].slice(0, 8);
  return NextResponse.json({
    success: true,
    guest: {
      name: current.customer_name || "Guest",
      phone: current.customer_phone || null,
      email: current.customer_email || null,
      visits: terminalVisits.length,
      reservations: rows.length,
      noShows: rows.filter((row) => row.status === "no_show").length,
      cancellations: rows.filter((row) => ["cancelled","declined"].includes(String(row.status || "").toLowerCase())).length,
      averagePartySize,
      preferredTable,
      favoriteServer,
      notes,
      lastVisit: terminalVisits.find((row) => row.id !== current.id) || null,
    },
  }, { headers: { "Cache-Control": "no-store", "X-TheOutHaven-API-Lane": "reserve-v1" } });
}