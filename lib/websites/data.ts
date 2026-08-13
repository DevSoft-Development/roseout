import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type WebsiteStatus = "draft" | "ready" | "published" | "paused" | "failed";
export type WebsitePublishStatus = "not_published" | "queued" | "publishing" | "published" | "failed";

export type WebsiteSection = {
  id: string;
  type: "hero" | "about" | "gallery" | "hours" | "contact" | "reservations" | "menu" | "offers" | "custom";
  enabled: boolean;
  heading?: string;
  body?: string;
  liveBindings?: string[];
};

export type LocationWebsite = {
  id: string;
  location_id: string;
  status: WebsiteStatus;
  site_title: string | null;
  theme: Record<string, unknown>;
  sections: WebsiteSection[];
  custom_content: Record<string, unknown>;
  hosting_provider: "lightsail";
  hosting_node_id: string | null;
  published_version: number | null;
  last_publish_status: WebsitePublishStatus;
  last_publish_error: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export const defaultWebsiteSections: WebsiteSection[] = [
  { id: "hero", type: "hero", enabled: true, liveBindings: ["name", "primary_photo"] },
  { id: "about", type: "about", enabled: true },
  { id: "gallery", type: "gallery", enabled: true, liveBindings: ["photos"] },
  { id: "hours", type: "hours", enabled: true, liveBindings: ["hours"] },
  { id: "reservations", type: "reservations", enabled: true, liveBindings: ["reservation_link", "reservation_mode"] },
  { id: "contact", type: "contact", enabled: true, liveBindings: ["address", "phone", "social_links"] },
];

export async function getLocationWebsite(locationId: string): Promise<LocationWebsite | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("location_websites")
      .select("*")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) return null;
    return (data || null) as LocationWebsite | null;
  } catch {
    return null;
  }
}

export async function ensureLocationWebsite(locationId: string, siteTitle?: string | null): Promise<LocationWebsite | null> {
  const existing = await getLocationWebsite(locationId);
  if (existing) return existing;
  try {
    const { data, error } = await supabaseAdmin
      .from("location_websites")
      .insert({
        location_id: locationId,
        site_title: siteTitle || null,
        sections: defaultWebsiteSections,
        theme: { preset: "signature", radius: "soft", density: "comfortable" },
      })
      .select("*")
      .single();
    if (error) return null;
    return data as LocationWebsite;
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
    "Menu/package links",
    "Social links",
  ];
}
