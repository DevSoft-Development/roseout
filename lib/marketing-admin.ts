import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const MARKETING_ADMIN_ROLES = ["superuser", "admin", "editor"] as const;
export const MARKETING_VIEW_ROLES = ["superuser", "admin", "editor", "viewer"] as const;

export type CampaignStatus = "draft" | "scheduled" | "sent" | "failed";
export type CampaignType = "social_post" | "email_blast" | "text_blast" | "all_channels";
export type MarketingChannel = "email" | "sms" | "instagram" | "tiktok" | "youtube_shorts";

export async function requireMarketingAdminApi() {
  return requireAdminApiRole([...MARKETING_ADMIN_ROLES]);
}

export async function requireMarketingViewerApi() {
  return requireAdminApiRole([...MARKETING_VIEW_ROLES]);
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeStringOrNull(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

export function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function normalizeCampaignType(value: unknown): CampaignType {
  if (
    value === "social_post" ||
    value === "email_blast" ||
    value === "text_blast" ||
    value === "all_channels"
  ) {
    return value;
  }

  return "all_channels";
}

export function normalizeCampaignStatus(value: unknown): CampaignStatus {
  if (value === "scheduled" || value === "sent" || value === "failed") {
    return value;
  }

  return "draft";
}

export function unsubscribeUrl(recipientId?: string | null, email?: string | null) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://theouthaven.com";
  const url = new URL("/unsubscribe", base);
  if (recipientId) url.searchParams.set("subscriber", recipientId);
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

export function locationUrl(locationSourceType?: string | null, locationSourceId?: string | null, publicLocationUrl?: string | null) {
  if (publicLocationUrl) return publicLocationUrl;

  const base = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://theouthaven.com";
  if (locationSourceType && locationSourceId) {
    return new URL(`/locations/${locationSourceType}/${locationSourceId}`, base).toString();
  }

  return base;
}

export async function loadCampaign(id: string) {
  return supabaseAdmin
    .from("marketing_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
}

export async function hasSuccessfulSend(campaignId: string, channel: MarketingChannel) {
  const { count, error } = await supabaseAdmin
    .from("marketing_send_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("channel", channel)
    .eq("status", "sent");

  if (error) throw new Error(error.message);
  return Number(count || 0) > 0;
}

export async function updateCampaignStatus(campaignId: string, status: CampaignStatus, fields: Record<string, unknown> = {}) {
  return supabaseAdmin
    .from("marketing_campaigns")
    .update({ status, updated_at: nowIso(), ...fields })
    .eq("id", campaignId);
}
