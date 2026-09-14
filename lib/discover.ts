import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function loadDiscoverSections(): Promise<DiscoverSection[]> {
  const now = new Date().toISOString();
  const [{ data: sections, error: sectionError }, { data: items, error: itemError }] = await Promise.all([
    supabaseAdmin
      .from("discover_sections")
      .select("id,eyebrow,title,description,enabled,sort_order")
      .eq("enabled", true)
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("discover_items")
      .select("id,section_id,title,subtitle,image_url,href,query,badge,location_id,sponsored,sponsor_label,enabled,sort_order,starts_at,ends_at,metadata")
      .eq("enabled", true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("sort_order", { ascending: true }),
  ]);

  if (sectionError || itemError) {
    console.error("DISCOVER_LOAD_ERROR", sectionError?.message || itemError?.message);
    return [];
  }

  const grouped = new Map<string, DiscoverItem[]>();
  for (const item of (items || []) as DiscoverItem[]) {
    const group = grouped.get(item.section_id) || [];
    group.push(item);
    grouped.set(item.section_id, group);
  }

  return ((sections || []) as Omit<DiscoverSection, "items">[]).map((section) => ({
    ...section,
    items: grouped.get(section.id) || [],
  }));
}
