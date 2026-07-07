import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

import { requireReservePermission } from "@/lib/reserve/locationPermissions";
import { getSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function qr(value: string) {
  return QRCode.toDataURL(value, {
    margin: 2,
    width: 500,
  });
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId") || "";

  const auth = await requireReservePermission(locationId, "viewDashboard");

  if (auth.error) {
    return auth.error;
  }

  const { data: loc } = await supabaseAdmin
    .from("locations")
    .select(
      "id,slug,name,restaurant_name,activity_name,claim_url,claim_qr_url,claim_qr_code_url,qr_code_data_url,qr_code_url,public_location_url,qr_link,location_type",
    )
    .eq("id", locationId)
    .maybeSingle();

  if (!loc) {
    return NextResponse.json(
      {
        success: false,
        error: "Location not found.",
      },
      { status: 404 },
    );
  }

  const site = getSiteUrl();

  const type = String((loc as any).location_type || "restaurants").includes(
    "activ",
  )
    ? "activities"
    : "restaurants";

  const slug = (loc as any).slug || locationId;

  const bookingUrl = `${site}/reserve/location/${encodeURIComponent(
    locationId,
  )}?type=${type}`;

  const publicLocationUrl =
    (loc as any).public_location_url || `${site}/locations/${type}/${slug}`;

  const claimUrl =
    (loc as any).claim_url ||
    (loc as any).qr_link ||
    `${site}/business/claim?location=${locationId}`;

  const { data: items } = await supabaseAdmin
    .from("reservation_resources")
    .select("id,name,item_name,resource_name")
    .eq("location_id", locationId)
    .limit(50);

  return NextResponse.json({
    success: true,
    bookingUrl,
    claimUrl,
    publicLocationUrl,
    bookingQr: await qr(bookingUrl),
    claimQr:
      (loc as any).claim_qr_url ||
      (loc as any).claim_qr_code_url ||
      (await qr(claimUrl)),
    publicQr:
      (loc as any).qr_code_data_url ||
      (loc as any).qr_code_url ||
      (await qr(publicLocationUrl)),
    tables: await Promise.all(
      (items || []).map(async (item: any) => {
        const tableUrl = `${bookingUrl}&space=${encodeURIComponent(item.id)}`;

        return {
          id: item.id,
          name: item.name || item.item_name || item.resource_name || "Space",
          url: tableUrl,
          qr: await qr(tableUrl),
        };
      }),
    ),
    access: auth.access,
  });
}