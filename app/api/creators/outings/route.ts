import { NextRequest, NextResponse } from "next/server";
import { findCreatorForUser } from "@/lib/creator-partners/program";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const creator = await findCreatorForUser(user.id, user.email);
    if (!creator || creator.application_status !== "approved" || creator.status !== "active") return NextResponse.json({ error: "Creator Partner access is required." }, { status: 403 });

    const form = await request.formData();
    const title = String(form.get("title") || "").trim().slice(0, 120);
    const subtitle = String(form.get("subtitle") || "").trim().slice(0, 280);
    const searchQuery = String(form.get("search_query") || "").trim().slice(0, 300);
    const imageUrl = String(form.get("image_url") || "").trim().slice(0, 1200);
    if (!title || !searchQuery) return NextResponse.json({ error: "Add an outing name and what someone should search for." }, { status: 400 });

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("creator_partner_outings").insert({
      creator_source_id: creator.id,
      title,
      subtitle: subtitle || null,
      search_query: searchQuery,
      image_url: imageUrl || null,
      status: "published",
      published_at: now,
      metadata: { creator_key: creator.creator_key, source: "creator_dashboard" },
    });
    if (error) throw error;
    await supabaseAdmin.from("gtm_creator_sources").update({ last_activity_at: now, updated_at: now }).eq("id", creator.id);
    return NextResponse.redirect(new URL("/creator/dashboard?outing=published", request.url), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "We couldn’t publish that outing." }, { status: 500 });
  }
}
