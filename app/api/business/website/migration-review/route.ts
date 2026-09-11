import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim() || "";
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const { data: website, error } = await supabaseAdmin.from("business_websites").select("id,custom_content").eq("location_id", locationId).maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to load migration review." }, { status: 500 });
  const imported = (website?.custom_content as any)?.website_import || null;
  return NextResponse.json({ ok: true, import: imported, review_required: Boolean(imported), review_status: imported?.review_status || null });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || "").trim();
  const decision = String(body.decision || "");
  if (!locationId || !["approved", "needs_changes"].includes(decision)) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website, error } = await supabaseAdmin.from("business_websites").select("id,custom_content").eq("location_id", locationId).maybeSingle();
  if (error || !website) return NextResponse.json({ error: "Website not found." }, { status: 404 });
  const custom = website.custom_content && typeof website.custom_content === "object" ? website.custom_content as Record<string, any> : {};
  const imported = custom.website_import;
  if (!imported || typeof imported !== "object") return NextResponse.json({ error: "No imported website is waiting for review." }, { status: 409 });
  const nextImport = {
    ...imported,
    review_status: decision,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    review_note: String(body.note || "").trim().slice(0, 500) || null,
  };
  const nextCustom = { ...custom, website_import: nextImport };
  const { data: updated, error: updateError } = await supabaseAdmin.from("business_websites").update({ custom_content: nextCustom, updated_at: new Date().toISOString() }).eq("id", website.id).select("id,custom_content").single();
  if (updateError) return NextResponse.json({ error: "Unable to save migration review." }, { status: 500 });
  return NextResponse.json({ ok: true, website: updated, review_status: decision });
}
