import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SUPPORTED = ["instagram", "facebook", "tiktok", "youtube"] as const;
type Provider = (typeof SUPPORTED)[number];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isProvider(value: string): value is Provider {
  return (SUPPORTED as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const guard = await requireLocationPermission({
    userId: user.id,
    userEmail: user.email ?? null,
    locationId: text(body.locationId) || undefined,
    permission: "marketing.edit",
  });
  if (guard.error || !guard.access?.canonicalLocationId) {
    return NextResponse.json({ error: "You do not have access to this location." }, { status: guard.error?.status || 403 });
  }

  const locationId = String(guard.access.canonicalLocationId);
  const requestedProvider = text(body.provider).toLowerCase();
  if (requestedProvider && !isProvider(requestedProvider)) {
    return NextResponse.json({ error: "Unsupported social provider." }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,display_name,username")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .eq("status", "connected")
    .in("provider", [...SUPPORTED])
    .order("connected_at", { ascending: false });
  if (requestedProvider) query = query.eq("provider", requestedProvider);

  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const latestByProvider = new Map<Provider, { id: string; provider: Provider; display_name: string | null; username: string | null }>();
  for (const row of rows || []) {
    const provider = String(row.provider);
    if (!isProvider(provider) || latestByProvider.has(provider)) continue;
    latestByProvider.set(provider, {
      id: String(row.id),
      provider,
      display_name: row.display_name || null,
      username: row.username || null,
    });
  }

  if (!latestByProvider.size) {
    return NextResponse.json({ error: requestedProvider ? `Connect ${requestedProvider} first.` : "Connect at least one social account first." }, { status: 409 });
  }

  const results = [];
  for (const connection of latestByProvider.values()) {
    try {
      const synced = await ingestSocialMetrics(connection.id);
      results.push({
        provider: connection.provider,
        account: connection.username || connection.display_name || connection.provider,
        ok: synced.errors === 0,
        accounts: synced.accounts,
        posts: synced.posts,
        errors: synced.errors,
      });
    } catch (caught) {
      results.push({
        provider: connection.provider,
        account: connection.username || connection.display_name || connection.provider,
        ok: false,
        accounts: 0,
        posts: 0,
        errors: 1,
        error: caught instanceof Error ? caught.message : "Metrics sync failed.",
      });
    }
  }

  const errors = results.reduce((sum, result) => sum + Number(result.errors || 0), 0);
  return NextResponse.json({
    ok: errors === 0,
    locationId,
    connections: results.length,
    errors,
    results,
  }, { status: errors === results.length ? 502 : 200 });
}
