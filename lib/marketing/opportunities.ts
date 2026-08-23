import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export async function refreshMarketingContentOpportunities() {
  const now = new Date().toISOString();
  const [eventsResult, experiencesResult, offersResult] = await Promise.all([
    supabaseAdmin.from("events").select("id,location_id,title,description,image_url,starts_at,status,category,venue_name,city,state").not("location_id", "is", null).gte("starts_at", now).in("status", ["published", "active", "approved"]).order("starts_at", { ascending: true }).limit(250),
    supabaseAdmin.from("experiences").select("id,location_id,title,description,image_url,status,category,venue_name,city,state,price_per_person,duration_minutes").not("location_id", "is", null).in("status", ["published", "active", "approved"]).limit(250),
    supabaseAdmin.from("location_offers").select("id,location_id,title,description,offer_type,start_date,end_date,is_active,metadata").eq("is_active", true).gte("end_date", now.slice(0, 10)).limit(250),
  ]);
  if (eventsResult.error) throw eventsResult.error;
  if (experiencesResult.error) throw experiencesResult.error;
  if (offersResult.error) throw offersResult.error;

  const rows = [
    ...(eventsResult.data || []).map((row) => ({ source_type: "event", source_id: row.id, location_id: row.location_id, title: row.title, description: row.description, image_url: row.image_url, metadata: { source: row }, updated_at: now })),
    ...(experiencesResult.data || []).map((row) => ({ source_type: "experience", source_id: row.id, location_id: row.location_id, title: row.title, description: row.description, image_url: row.image_url, metadata: { source: row }, updated_at: now })),
    ...(offersResult.data || []).map((row) => ({ source_type: "offer", source_id: row.id, location_id: row.location_id, title: row.title, description: row.description, image_url: null, metadata: { source: row }, updated_at: now })),
  ];
  if (rows.length) {
    const { error } = await supabaseAdmin.from("marketing_content_opportunities").upsert(rows, { onConflict: "source_type,source_id", ignoreDuplicates: false });
    if (error) throw error;
  }
  return { events: eventsResult.data?.length || 0, experiences: experiencesResult.data?.length || 0, offers: offersResult.data?.length || 0, total: rows.length };
}

export async function featureMarketingOpportunity(opportunityId: string, userId: string) {
  const { data: opportunity, error } = await supabaseAdmin.from("marketing_content_opportunities").select("*").eq("id", opportunityId).maybeSingle();
  if (error) throw error;
  if (!opportunity) throw new Error("Content opportunity not found.");

  const { data: approvedAssets } = opportunity.location_id
    ? await supabaseAdmin.from("marketing_assets").select("id,storage_path,asset_type,display_name").eq("scope", "location").eq("location_id", opportunity.location_id).eq("allow_theouthaven_feature", true).in("rights_status", ["owned", "licensed", "permission_granted"]).or("rights_expires_at.is.null,rights_expires_at.gt.now()").limit(20)
    : { data: [] };

  const mediaUrls = [opportunity.image_url, ...(approvedAssets || []).map((asset) => asset.storage_path)]
    .filter((value): value is string => typeof value === "string" && /^https?:\/\//i.test(value));

  const { data: content, error: contentError } = await supabaseAdmin.from("marketing_content_items").insert({
    scope: "platform",
    location_id: opportunity.location_id,
    source_type: opportunity.source_type,
    source_id: opportunity.source_id,
    title: opportunity.title,
    content_type: "social_post",
    owner_user_id: userId,
    status: "draft",
    priority: "normal",
    selected_platforms: ["instagram", "facebook", "tiktok", "youtube"],
    media_urls: mediaUrls,
    metadata: { ...(opportunity.metadata || {}), marketing_opportunity_id: opportunity.id, approved_location_asset_ids: (approvedAssets || []).map((asset) => asset.id) },
    created_by: userId,
  }).select("*").single();
  if (contentError || !content) throw contentError || new Error("Could not create content from opportunity.");

  if (opportunity.location_id) {
    await supabaseAdmin.from("marketing_content_locations").upsert({ content_item_id: content.id, location_id: opportunity.location_id, role: "featured" }, { onConflict: "content_item_id,location_id,role" });
  }
  if ((approvedAssets || []).length) {
    await supabaseAdmin.from("marketing_content_asset_links").upsert((approvedAssets || []).map((asset, index) => ({ content_item_id: content.id, asset_id: asset.id, sort_order: index })), { onConflict: "content_item_id,asset_id" });
  }
  await supabaseAdmin.from("marketing_content_opportunities").update({ status: "featured", featured_content_item_id: content.id, updated_at: new Date().toISOString() }).eq("id", opportunity.id);
  return content;
}
