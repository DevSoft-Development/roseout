import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locationId = String(searchParams.get("locationId") || "").trim();

  if (!locationId) {
    return NextResponse.json({ error: "Missing locationId." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("description, short_description, cuisine, category, website, website_url, phone, menu_url, address, city, state, zip_code, image_url, main_image, images, hours, operating_hours")
    .eq("id", locationId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  }

  return NextResponse.json({ location: data });
}
