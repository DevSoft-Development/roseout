import { NextResponse } from "next/server";
import { getPublicLocationMenu } from "@/lib/locations/menu";
import { getPublicLocationMenuHref } from "@/lib/locations/public-location-url";
import { menuResponseShape } from "@/lib/locations/menuValidation";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const locationId = url.searchParams.get("locationId") || url.searchParams.get("slug") || "";
  if (!locationId) return NextResponse.json({ ok: false, message: "Location is required" }, { status: 400 });
  const menu = await getPublicLocationMenu(locationId, false);
  return NextResponse.json(menuResponseShape({ location: menu.location, page: menu.page, sections: menu.sections, items: menu.items, previewUrl: menu.location ? getPublicLocationMenuHref(menu.location) : "", permissions: { canRead: true, canEdit: false } }));
}
