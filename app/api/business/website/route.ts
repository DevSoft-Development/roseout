import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { defaultWebsiteSections } from "@/lib/websites/data";

async function ownedLocation(user: { id: string; email?: string | null }, locationId: string) {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,name,title")
    .eq("id", locationId)
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .maybeSingle();
  return data || null;
}

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from("location_websites").select("*").eq("location_id", locationId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, website: existing });

  const { data, error } = await supabaseAdmin.from("location_websites").insert({
    location_id: locationId,
    site_title: location.name || location.title || "Your business",
    sections: defaultWebsiteSections,
    theme: { preset: "signature", radius: "soft", density: "comfortable" },
  }).select("*").single();
  if (error) return NextResponse.json({ error: "Website builder setup is not available yet." }, { status: 503 });
  return NextResponse.json({ ok: true, website: data });
}

export async function PATCH(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await ownedLocation(user, locationId);
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.site_title === "string") updates.site_title = body.site_title.trim().slice(0, 160) || null;
  if (body.theme && typeof body.theme === "object" && !Array.isArray(body.theme)) updates.theme = body.theme;
  if (Array.isArray(body.sections)) updates.sections = body.sections;
  if (body.custom_content && typeof body.custom_content === "object" && !Array.isArray(body.custom_content)) updates.custom_content = body.custom_content;

  const { data, error } = await supabaseAdmin.from("location_websites").update(updates).eq("location_id", locationId).select("*").single();
  if (error) return NextResponse.json({ error: "Unable to save website changes." }, { status: 500 });
  return NextResponse.json({ ok: true, website: data });
}
