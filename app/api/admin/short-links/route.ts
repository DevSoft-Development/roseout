import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  allocateShortCode,
  buildShortLinkUrl,
  normalizeShortCode,
  normalizeShortLinkDestination,
} from "@/lib/outings/short-links";
import type { AdminRole } from "@/lib/users/roles";

const WRITE_ROLES = [
  "superadmin",
  "admin",
  "manager",
  "marketing_manager",
  "marketing_specialist",
] as const satisfies readonly AdminRole[];

function cleanOptionalText(value: unknown, max = 255) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parseOptionalDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

async function codeIsAvailable(code: string) {
  const admin = getSupabaseAdminClient();
  const [{ data: registered, error: registeredError }, { data: outing, error: outingError }] = await Promise.all([
    admin.from("short_links").select("id").eq("code", code).maybeSingle(),
    admin.from("outings").select("id").eq("metadata->>short_code", code).maybeSingle(),
  ]);

  if (registeredError) throw registeredError;
  if (outingError) throw outingError;
  return !registered && !outing;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const params = req.nextUrl.searchParams;
  const rawLimit = Number(params.get("limit") || 100);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 100, 1), 250);
  const search = params.get("search")?.trim() || "";
  const active = params.get("active");

  const admin = getSupabaseAdminClient();
  let query = admin
    .from("short_links")
    .select("id,code,destination_url,link_type,entity_type,entity_id,campaign_id,title,is_active,expires_at,max_clicks,click_count,last_clicked_at,created_by,metadata,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);
  if (search) {
    const escaped = search.replace(/[,%()]/g, "");
    if (escaped) query = query.or(`code.ilike.%${escaped}%,title.ilike.%${escaped}%,destination_url.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Unable to list short links", error);
    return NextResponse.json({ error: "Unable to load short links." }, { status: 500 });
  }

  return NextResponse.json({
    links: (data || []).map((link) => ({
      ...link,
      short_url: buildShortLinkUrl(link.code),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => ({}));
  const destination = normalizeShortLinkDestination(body?.destination_url);
  if (!destination) {
    return NextResponse.json({ error: "A valid http or https destination URL is required." }, { status: 400 });
  }

  const expiresAt = parseOptionalDate(body?.expires_at);
  if (expiresAt === undefined) {
    return NextResponse.json({ error: "Expiration date is invalid." }, { status: 400 });
  }

  let maxClicks: number | null = null;
  if (body?.max_clicks !== null && body?.max_clicks !== undefined && body?.max_clicks !== "") {
    const parsed = Number(body.max_clicks);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "Maximum clicks must be a positive whole number." }, { status: 400 });
    }
    maxClicks = parsed;
  }

  const admin = getSupabaseAdminClient();
  let code: string;
  if (body?.code) {
    const customCode = normalizeShortCode(body.code);
    if (!customCode) {
      return NextResponse.json({ error: "Custom codes must be 8-20 letters, numbers, underscores, or hyphens." }, { status: 400 });
    }
    if (!(await codeIsAvailable(customCode))) {
      return NextResponse.json({ error: "That short code is already in use." }, { status: 409 });
    }
    code = customCode;
  } else {
    code = await allocateShortCode(admin);
  }

  const row = {
    code,
    destination_url: destination,
    link_type: cleanOptionalText(body?.link_type, 64) || "generic",
    entity_type: cleanOptionalText(body?.entity_type, 64),
    entity_id: cleanOptionalText(body?.entity_id, 255),
    campaign_id: cleanOptionalText(body?.campaign_id, 64),
    title: cleanOptionalText(body?.title, 255),
    is_active: body?.is_active !== false,
    expires_at: expiresAt,
    max_clicks: maxClicks,
    created_by: auth.adminUser?.user_id || auth.adminUser?.email || null,
    metadata: body?.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata) ? body.metadata : {},
  };

  const { data, error } = await admin
    .from("short_links")
    .insert(row)
    .select("id,code,destination_url,link_type,entity_type,entity_id,campaign_id,title,is_active,expires_at,max_clicks,click_count,last_clicked_at,created_by,metadata,created_at,updated_at")
    .single();

  if (error) {
    console.error("Unable to create short link", error);
    return NextResponse.json({ error: "Unable to create short link." }, { status: 500 });
  }

  return NextResponse.json({ link: { ...data, short_url: buildShortLinkUrl(data.code) } }, { status: 201 });
}
