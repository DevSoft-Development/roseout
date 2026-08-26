import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { buildShortLinkUrl, normalizeShortLinkDestination } from "@/lib/outings/short-links";
import type { AdminRole } from "@/lib/users/roles";

const WRITE_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "marketing_manager",
  "marketing_specialist",
] as const satisfies readonly AdminRole[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanOptionalText(value: unknown, max = 255) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function parseOptionalUuid(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : undefined;
}

function validId(id: string) {
  return UUID_PATTERN.test(id);
}

async function loadLink(id: string) {
  const admin = getSupabaseAdminClient();
  return admin
    .from("short_links")
    .select("id,code,destination_url,link_type,entity_type,entity_id,campaign_id,title,is_active,expires_at,max_clicks,click_count,last_clicked_at,created_by,metadata,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid link ID." }, { status: 400 });

  const { data, error } = await loadLink(id);
  if (error) return NextResponse.json({ error: "Unable to load short link." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Short link not found." }, { status: 404 });

  const admin = getSupabaseAdminClient();
  const { data: recentClicks } = await admin
    .from("short_link_clicks")
    .select("id,clicked_at,referrer,user_agent,country,region,city,utm_source,utm_medium,utm_campaign,utm_content,utm_term")
    .eq("short_link_id", id)
    .order("clicked_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    link: { ...data, short_url: buildShortLinkUrl(data.code) },
    recent_clicks: recentClicks || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid link ID." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(body, "destination_url")) {
    const destination = normalizeShortLinkDestination(body.destination_url);
    if (!destination) {
      return NextResponse.json({ error: "A valid http or https destination URL is required." }, { status: 400 });
    }
    updates.destination_url = destination;
  }

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    const title = cleanOptionalText(body.title, 255);
    if (title === undefined) return NextResponse.json({ error: "Title is invalid." }, { status: 400 });
    updates.title = title;
  }

  if (Object.prototype.hasOwnProperty.call(body, "link_type")) {
    const linkType = cleanOptionalText(body.link_type, 64);
    if (!linkType) return NextResponse.json({ error: "Link type is required." }, { status: 400 });
    updates.link_type = linkType;
  }

  if (Object.prototype.hasOwnProperty.call(body, "entity_type")) {
    const entityType = cleanOptionalText(body.entity_type, 64);
    if (entityType === undefined) return NextResponse.json({ error: "Entity type is invalid." }, { status: 400 });
    updates.entity_type = entityType;
  }

  if (Object.prototype.hasOwnProperty.call(body, "entity_id")) {
    const entityId = cleanOptionalText(body.entity_id, 255);
    if (entityId === undefined) return NextResponse.json({ error: "Entity ID is invalid." }, { status: 400 });
    updates.entity_id = entityId;
  }

  if (Object.prototype.hasOwnProperty.call(body, "campaign_id")) {
    const campaignId = parseOptionalUuid(body.campaign_id);
    if (campaignId === undefined) return NextResponse.json({ error: "Campaign ID must be a valid UUID." }, { status: 400 });
    updates.campaign_id = campaignId;
  }

  if (Object.prototype.hasOwnProperty.call(body, "expires_at")) {
    const expiresAt = parseOptionalDate(body.expires_at);
    if (expiresAt === undefined) return NextResponse.json({ error: "Expiration date is invalid." }, { status: 400 });
    updates.expires_at = expiresAt;
  }

  if (Object.prototype.hasOwnProperty.call(body, "max_clicks")) {
    if (body.max_clicks === null || body.max_clicks === "") {
      updates.max_clicks = null;
    } else {
      const parsed = Number(body.max_clicks);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "Maximum clicks must be a positive whole number." }, { status: 400 });
      }
      updates.max_clicks = parsed;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "is_active")) {
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "Active status must be true or false." }, { status: 400 });
    }
    updates.is_active = body.is_active;
  }

  if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
    if (!body.metadata || typeof body.metadata !== "object" || Array.isArray(body.metadata)) {
      return NextResponse.json({ error: "Metadata must be an object." }, { status: 400 });
    }
    updates.metadata = body.metadata;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No editable fields were provided." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("short_links")
    .update(updates)
    .eq("id", id)
    .select("id,code,destination_url,link_type,entity_type,entity_id,campaign_id,title,is_active,expires_at,max_clicks,click_count,last_clicked_at,created_by,metadata,created_at,updated_at")
    .maybeSingle();

  if (error) {
    console.error("Unable to update short link", error);
    return NextResponse.json({ error: "Unable to update short link." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Short link not found." }, { status: 404 });

  return NextResponse.json({ link: { ...data, short_url: buildShortLinkUrl(data.code) } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  if (!validId(id)) return NextResponse.json({ error: "Invalid link ID." }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("short_links")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,code,is_active")
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Unable to disable short link." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Short link not found." }, { status: 404 });

  return NextResponse.json({ success: true, link: data });
}
