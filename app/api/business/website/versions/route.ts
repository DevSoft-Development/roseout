import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

async function ownedWebsite(user: { id: string; email?: string | null }, locationId: string) {
  const { data: location } = await supabaseAdmin.from("locations").select("id").eq("id", locationId).or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`).maybeSingle();
  if (!location) return null;
  const { data: website } = await supabaseAdmin.from("location_websites").select("*").eq("location_id", locationId).maybeSingle();
  return website || null;
}

export async function GET(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const locationId = new URL(request.url).searchParams.get("location_id")?.trim();
  if (!locationId) return NextResponse.json({ error: "Missing location." }, { status: 400 });
  const website = await ownedWebsite(user, locationId);
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  const { data, error } = await supabaseAdmin.from("location_website_versions").select("id,version,source,created_at,published_at").eq("website_id", website.id).order("version", { ascending: false }).limit(25);
  if (error) return NextResponse.json({ error: "Unable to load version history." }, { status: 500 });
  return NextResponse.json({ ok: true, versions: data || [], published_version: website.published_version, publish_status: website.last_publish_status });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const locationId = String(body?.location_id || "").trim();
  const version = Number(body?.version || 0);
  if (!locationId || !Number.isInteger(version) || version < 1) return NextResponse.json({ error: "Choose a valid version." }, { status: 400 });
  const website = await ownedWebsite(user, locationId);
  if (!website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  const { data: target } = await supabaseAdmin.from("location_website_versions").select("snapshot").eq("website_id", website.id).eq("version", version).maybeSingle();
  if (!target?.snapshot) return NextResponse.json({ error: "Version not found." }, { status: 404 });
  const snapshot = target.snapshot as Record<string, unknown>;

  const { data: latest } = await supabaseAdmin.from("location_website_versions").select("version").eq("website_id", website.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const nextVersion = Number(latest?.version || 0) + 1;
  const rollbackSnapshot = { theme: snapshot.theme || {}, sections: snapshot.sections || [], custom_content: snapshot.custom_content || {} };

  const { error: versionError } = await supabaseAdmin.from("location_website_versions").insert({ website_id: website.id, version: nextVersion, snapshot: rollbackSnapshot, source: "rollback", created_by: user.id });
  if (versionError) return NextResponse.json({ error: "Unable to create rollback version." }, { status: 500 });

  const { data: updated, error: updateError } = await supabaseAdmin.from("location_websites").update({ theme: rollbackSnapshot.theme, sections: rollbackSnapshot.sections, custom_content: rollbackSnapshot.custom_content, status: "ready", updated_at: new Date().toISOString() }).eq("id", website.id).select("*").single();
  if (updateError) return NextResponse.json({ error: "Unable to restore that version." }, { status: 500 });
  return NextResponse.json({ ok: true, version: nextVersion, website: updated });
}
