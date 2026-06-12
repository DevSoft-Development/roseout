import { NextRequest, NextResponse } from "next/server";
import { requireAdminLocationApiRead } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { buildAdminLocationScopedUrl, getDisplayLocationName } from "@/lib/admin/admin-location-context";
import { getReserveAccessForLocation } from "@/lib/reserve-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl } from "@/lib/site-url";

const ZERO = {
  today: 0,
  pending: 0,
  confirmed: 0,
  checked_in: 0,
  seated: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
};

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

async function safeCount(table: string, apply: (query: any) => any) {
  const result = await apply(supabaseAdmin.from(table).select("id", { count: "exact", head: true }));
  return result.error ? 0 : result.count || 0;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ locationId: string }> }) {
  const auth = await requireAdminLocationApiRead();
  if (auth.error) return auth.error;

  const { locationId } = await params;
  const { data: location, error } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!location) return NextResponse.json({ success: false, error: "We could not find that location." }, { status: 404 });

  const [reservations, activeHoldsCount, layoutResourceCount, access] = await Promise.all([
    supabaseAdmin.from("location_reservations").select("status,reservation_date").eq("location_id", locationId).limit(1000),
    safeCount("reservation_holds", (query) => query.eq("location_id", locationId).gt("expires_at", new Date().toISOString())),
    safeCount("layout_items", (query) => query.eq("location_id", locationId).neq("is_active", false)),
    getReserveAccessForLocation(locationId),
  ]);

  const counts = { ...ZERO };
  for (const reservation of reservations.data || []) {
    const status = String((reservation as any).status || "");
    if (status in counts) counts[status as keyof typeof counts] += 1;
    if ((reservation as any).reservation_date === todayKey()) counts.today += 1;
  }

  const base = getSiteUrl().replace(/\/$/, "");
  const publicBookingPath = `/reserve/location/${locationId}`;
  const links = {
    hostViewUrl: buildAdminLocationScopedUrl("/reserve/dashboard/reservations", locationId),
    layoutBuilderUrl: buildAdminLocationScopedUrl("/reserve/dashboard/location-layout", locationId),
    bookingPageSettingsUrl: buildAdminLocationScopedUrl("/reserve/dashboard/layout", locationId),
    embedCodeUrl: buildAdminLocationScopedUrl("/reserve/dashboard/layout", locationId),
    publicBookingUrl: `${base}${publicBookingPath}`,
    publicEmbedUrl: `${base}/embed/reservations/${locationId}`,
    locationProfileUrl: `/admin/dashboard/crm/${locationId}`,
  };

  const warnings = [
    layoutResourceCount === 0 ? "no layout resources" : null,
    !location.email ? "no email" : null,
    !location.phone ? "no phone" : null,
    !(location.image_url || location.logo_url || location.main_image) ? "no image" : null,
  ].filter(Boolean);

  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId,
    actionType: "admin_location_view",
    targetType: "location",
    targetId: locationId,
    metadata: { summary: true },
    request,
  });

  return NextResponse.json({
    success: true,
    location: {
      id: location.id,
      name: getDisplayLocationName(location),
      location_type: location.location_type || location.source_table || null,
      address: location.address || null,
      city: location.city || null,
      state: location.state || null,
      zip_code: location.zip_code || location.zip || null,
      phone: location.phone || null,
      email: location.email || null,
      owner_email: location.owner_email || location.claimed_by_email || null,
      plan: access.plan,
    },
    reservationAccess: access,
    reservationCounts: counts,
    activeHoldsCount,
    layoutResourceCount,
    missingSetupWarnings: warnings,
    links,
  });
}
