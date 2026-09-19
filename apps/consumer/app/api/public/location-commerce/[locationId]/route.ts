import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await params;
  const { data: location } = await supabaseAdmin.from("locations").select("id,name,location_name,address,city,state,phone,website,location_type,category,cuisine_type,activity_type").eq("id", locationId).maybeSingle();
  const { data: page } = await supabaseAdmin.from("location_commerce_pages").select("*").eq("location_id", locationId).eq("page_type", "menu").eq("status", "published").eq("is_active", true).order("sort_order").limit(1).maybeSingle();
  if (!page) return NextResponse.json({ ok: true, data: { location, page: null, sections: [], items: [] } });
  const [{ data: sections }, { data: items }] = await Promise.all([
    supabaseAdmin.from("location_commerce_sections").select("*").eq("location_id", locationId).eq("commerce_page_id", page.id).eq("is_active", true).order("sort_order"),
    supabaseAdmin.from("location_commerce_items").select("*").eq("location_id", locationId).eq("commerce_page_id", page.id).order("is_available", { ascending: false }).order("sort_order"),
  ]);
  return NextResponse.json({ ok: true, data: { location, page, sections: sections || [], items: items || [] } });
}
