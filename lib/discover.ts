import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadDiscoverPromotionItems } from "@/lib/promotions/engine";

export type DiscoverItem = {
  id: string;
  section_id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  href: string | null;
  query: string | null;
  badge: string | null;
  location_id: string | null;
  sponsored: boolean;
  sponsor_label: string | null;
  enabled: boolean;
  sort_order: number;
  starts_at: string | null;
  ends_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type DiscoverSection = {
  id: string;
  eyebrow: string | null;
  title: string;
  description: string | null;
  enabled: boolean;
  sort_order: number;
  items: DiscoverItem[];
};

async function loadCreatorPicks(): Promise<DiscoverSection | null> {
  const { data: outings, error } = await supabaseAdmin
    .from("creator_partner_outings")
    .select("id,creator_source_id,title,subtitle,search_query,image_url,sort_order,published_at")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("published_at", { ascending: false })
    .limit(12);
  if (error) {
    if (!String(error.message || "").toLowerCase().includes("creator_partner_outings")) console.error("CREATOR_DISCOVER_LOAD_ERROR", error.message);
    return null;
  }
  if (!outings?.length) return null;

  const creatorIds = Array.from(new Set(outings.map((row: any) => String(row.creator_source_id)).filter(Boolean)));
  const { data: creators, error: creatorError } = await supabaseAdmin.from("gtm_creator_sources").select("id,display_name,slug,creator_key").in("id", creatorIds).eq("status", "active").eq("application_status", "approved");
  if (creatorError) return null;
  const creatorMap = new Map((creators || []).map((row: any) => [String(row.id), row]));
  const items: DiscoverItem[] = outings.flatMap((outing: any, index: number) => {
    const creator = creatorMap.get(String(outing.creator_source_id));
    if (!creator) return [];
    return [{
      id: `creator-${outing.id}`,
      section_id: "creator-picks",
      title: String(outing.title),
      subtitle: outing.subtitle ? String(outing.subtitle) : null,
      image_url: outing.image_url ? String(outing.image_url) : null,
      href: `/creators/${encodeURIComponent(String(creator.slug || creator.creator_key))}`,
      query: outing.search_query ? String(outing.search_query) : null,
      badge: `Curated by ${creator.display_name}`,
      location_id: null,
      sponsored: false,
      sponsor_label: null,
      enabled: true,
      sort_order: Number(outing.sort_order || index + 1),
      starts_at: null,
      ends_at: null,
      metadata: { creator_source_id: outing.creator_source_id, outing_id: outing.id },
    } satisfies DiscoverItem];
  });
  if (!items.length) return null;
  return { id: "creator-picks", eyebrow: "Local creators", title: "Creator Picks", description: "Outing ideas curated by people who know the local scene.", enabled: true, sort_order: 35, items };
}

export async function loadDiscoverSections(): Promise<DiscoverSection[]> {
  const now = new Date().toISOString();
  const [{ data: sections, error: sectionError }, { data: items, error: itemError }, promotionItems, creatorPicks] = await Promise.all([
    supabaseAdmin.from("discover_sections").select("id,eyebrow,title,description,enabled,sort_order").eq("enabled", true).order("sort_order", { ascending: true }),
    supabaseAdmin.from("discover_items").select("id,section_id,title,subtitle,image_url,href,query,badge,location_id,sponsored,sponsor_label,enabled,sort_order,starts_at,ends_at,metadata").eq("enabled", true).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gte.${now}`).order("sort_order", { ascending: true }),
    loadDiscoverPromotionItems(),
    loadCreatorPicks(),
  ]);

  if (sectionError || itemError) {
    console.error("DISCOVER_LOAD_ERROR", sectionError?.message || itemError?.message);
    return creatorPicks ? [creatorPicks] : [];
  }

  const grouped = new Map<string, DiscoverItem[]>();
  for (const item of [...((items || []) as DiscoverItem[]), ...(promotionItems as DiscoverItem[])]) {
    const group = grouped.get(item.section_id) || [];
    group.push(item);
    group.sort((a, b) => a.sort_order - b.sort_order);
    grouped.set(item.section_id, group);
  }

  const base = ((sections || []) as Omit<DiscoverSection, "items">[]).map((section) => ({ ...section, items: grouped.get(section.id) || [] }));
  if (creatorPicks) base.push(creatorPicks);
  return base.sort((a, b) => a.sort_order - b.sort_order);
}
