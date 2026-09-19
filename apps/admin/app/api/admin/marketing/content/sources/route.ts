import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SourceType = "location" | "event" | "experience" | "offer" | "outing";

function locationName(row: Record<string, unknown>) {
  return String(row.name || row.business_name || row.restaurant_name || row.activity_name || "Location");
}

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketing);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const sourceType = (url.searchParams.get("type") || "location") as SourceType;
  const q = (url.searchParams.get("q") || "").trim();
  if (!["location", "event", "experience", "offer", "outing"].includes(sourceType)) {
    return NextResponse.json({ success: false, error: "Unsupported source type." }, { status: 400 });
  }

  try {
    if (sourceType === "location") {
      let query = supabaseAdmin
        .from("locations")
        .select("id,name,business_name,restaurant_name,activity_name,description,short_description,city,state,neighborhood,image_url,main_image,storage_photo_url,category,primary_category,public_location_url,instagram_url,facebook_url,tiktok_url")
        .is("deleted_at", null)
        .limit(40);
      if (q) query = query.or(`name.ilike.%${q}%,business_name.ilike.%${q}%,restaurant_name.ilike.%${q}%,activity_name.ilike.%${q}%,city.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({
        success: true,
        items: (data || []).map((row) => ({
          type: "location",
          id: row.id,
          location_id: row.id,
          title: locationName(row),
          description: row.short_description || row.description,
          subtitle: [row.neighborhood || row.city, row.state].filter(Boolean).join(", "),
          image_url: row.storage_photo_url || row.main_image || row.image_url,
          metadata: row,
        })),
      });
    }

    if (sourceType === "event") {
      let query = supabaseAdmin
        .from("events")
        .select("id,location_id,title,description,category,venue_name,city,state,starts_at,ends_at,image_url,status,searchable,external_url")
        .in("status", ["published", "active", "approved", "draft"])
        .order("starts_at", { ascending: true })
        .limit(40);
      if (q) query = query.or(`title.ilike.%${q}%,venue_name.ilike.%${q}%,city.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, items: (data || []).map((row) => ({ type: "event", id: row.id, location_id: row.location_id, title: row.title, description: row.description, subtitle: [row.venue_name, row.starts_at ? new Date(row.starts_at).toLocaleString() : null].filter(Boolean).join(" · "), image_url: row.image_url, metadata: row })) });
    }

    if (sourceType === "experience") {
      let query = supabaseAdmin
        .from("experiences")
        .select("id,location_id,title,description,category,venue_name,city,state,image_url,status,price_per_person,duration_minutes")
        .in("status", ["published", "active", "approved", "draft"])
        .limit(40);
      if (q) query = query.or(`title.ilike.%${q}%,venue_name.ilike.%${q}%,city.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, items: (data || []).map((row) => ({ type: "experience", id: row.id, location_id: row.location_id, title: row.title, description: row.description, subtitle: [row.venue_name, row.city, row.state].filter(Boolean).join(" · "), image_url: row.image_url, metadata: row })) });
    }

    if (sourceType === "offer") {
      let query = supabaseAdmin
        .from("location_offers")
        .select("id,location_id,title,description,offer_type,start_date,end_date,is_active,metadata")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(40);
      if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, items: (data || []).map((row) => ({ type: "offer", id: row.id, location_id: row.location_id, title: row.title, description: row.description, subtitle: [row.offer_type, row.end_date ? `through ${row.end_date}` : null].filter(Boolean).join(" · "), image_url: null, metadata: row })) });
    }

    let query = supabaseAdmin
      .from("outings")
      .select("id,location_id,restaurant_location_id,activity_location_id,plan_title,source_query,status,planned_for,created_at,metadata")
      .order("created_at", { ascending: false })
      .limit(40);
    if (q) query = query.or(`plan_title.ilike.%${q}%,source_query.ilike.%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, items: (data || []).map((row) => ({ type: "outing", id: row.id, location_id: row.restaurant_location_id || row.location_id || row.activity_location_id, title: row.plan_title || row.source_query || "TheOutHaven outing", description: row.source_query, subtitle: row.planned_for ? new Date(row.planned_for).toLocaleString() : row.status, image_url: null, metadata: row })) });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load Marketing sources." }, { status: 500 });
  }
}
