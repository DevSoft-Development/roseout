import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type WebsiteStatus = "draft" | "ready" | "published" | "paused" | "failed";
export type WebsitePublishStatus = "not_published" | "queued" | "publishing" | "published" | "failed";

export type WebsiteSection = {
  id: string;
  type: "hero" | "about" | "gallery" | "hours" | "contact" | "reservations" | "menu" | "reviews" | "offers" | "custom";
  enabled: boolean;
  heading?: string;
  body?: string;
  liveBindings?: string[];
};

export type BusinessWebsite = {
  id: string;
  location_id: string;
  editor_status: WebsiteStatus;
  site_title: string | null;
  theme: Record<string, unknown>;
  sections: WebsiteSection[];
  custom_content: Record<string, unknown>;
  hosting_node_id: string | null;
  site_path: string | null;
  domain: string | null;
  platform_domain: string | null;
  published_version: number | null;
  last_publish_status: WebsitePublishStatus;
  last_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const defaultWebsiteSections: WebsiteSection[] = [
  { id: "hero", type: "hero", enabled: true, liveBindings: ["name", "primary_photo"] },
  { id: "about", type: "about", enabled: true },
  { id: "gallery", type: "gallery", enabled: true, liveBindings: ["photos"] },
  { id: "hours", type: "hours", enabled: true, liveBindings: ["hours"] },
  { id: "menu", type: "menu", enabled: true, liveBindings: ["menu"] },
  { id: "reviews", type: "reviews", enabled: true, liveBindings: ["approved_reviews"] },
  { id: "reservations", type: "reservations", enabled: true, liveBindings: ["reservation_link", "reservation_mode"] },
  { id: "contact", type: "contact", enabled: true, liveBindings: ["address", "phone", "social_links"] },
];

export function mergeWebsiteSectionsWithDefaults(sections: WebsiteSection[] | null | undefined) {
  const existing = Array.isArray(sections) ? sections : [];
  const byType = new Map(existing.map((section) => [section.type, section]));
  const merged = defaultWebsiteSections.map((fallback) => {
    const current = byType.get(fallback.type);
    return current ? { ...fallback, ...current, liveBindings: current.liveBindings?.length ? current.liveBindings : fallback.liveBindings } : { ...fallback };
  });
  for (const section of existing) {
    if (!defaultWebsiteSections.some((fallback) => fallback.type === section.type)) merged.push(section);
  }
  return merged;
}

export async function getBusinessWebsite(locationId: string): Promise<BusinessWebsite | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("business_websites")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) return null;
    return (data || null) as BusinessWebsite | null;
  } catch {
    return null;
  }
}

export async function ensureBusinessWebsite(locationId: string, siteTitle?: string | null): Promise<BusinessWebsite | null> {
  const existing = await getBusinessWebsite(locationId);
  if (existing) return { ...existing, sections: mergeWebsiteSectionsWithDefaults(existing.sections) };
  try {
    const { data, error } = await supabaseAdmin
      .from("business_websites")
      .insert({
        location_id: locationId,
        editor_status: "draft",
        site_title: siteTitle || null,
        sections: defaultWebsiteSections,
        theme: { preset: "signature", radius: "soft", density: "comfortable" },
        status: "provisioning",
        deployment_status: "pending",
        dns_status: "pending",
        ssl_status: "pending",
      })
      .select("*")
      .single();
    if (error) return null;
    return data as BusinessWebsite;
  } catch {
    return null;
  }
}

export function getWebsiteLiveSyncFields() {
  return [
    "Business name",
    "Address",
    "Phone",
    "Hours",
    "Current photos",
    "Reservation link and mode",
    "Published menu",
    "Approved verified reviews",
    "Social links",
  ];
}
