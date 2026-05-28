import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 300;

const CARD_FIELDS = "id,type,source_table,location_type,name,restaurant_name,activity_name,business_name,main_image,image_url,images,city,borough,neighborhood,category,primary_category,cuisine,cuisine_type,activity_type,rating,score,total_reviews,reservation_url,external_reservation_url,website,featured";

export async function GET(request: NextRequest) {
  const start = Date.now();
  const params = request.nextUrl.searchParams;
  const city = params.get("city");
  const borough = params.get("borough");
  const category = params.get("category");
  const type = params.get("type");
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(48, Math.max(1, Number(params.get("limit") || 24)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin.from("locations").select(CARD_FIELDS, { count: "planned" }).eq("is_searchable", true).neq("is_hidden", true).eq("data_status", "clean");
  if (city) query = query.ilike("city", city);
  if (borough) query = query.ilike("borough", borough);
  if (category) query = query.or(`primary_category.ilike.%${category}%,category.ilike.%${category}%,cuisine.ilike.%${category}%,activity_type.ilike.%${category}%`);
  if (type) query = query.or(`location_type.ilike.%${type}%,type.ilike.%${type}%,source_table.ilike.%${type}%`);

  const dbStart = Date.now();
  const { data, error, count } = await query.order("rating", { ascending: false, nullsFirst: false }).range(from, to);
  const dbMs = Date.now() - dbStart;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data || [];
  const hasMore = typeof count === "number" ? page * limit < count : items.length === limit;
  const totalMs = Date.now() - start;

  console.log("ROUTE_TIMING", JSON.stringify({ route: "/api/explore", total_ms: totalMs, db_ms: dbMs, cache_status: "miss", result_count: items.length }));

  return NextResponse.json({ items, page, limit, hasMore, totalEstimate: count ?? null });
}
