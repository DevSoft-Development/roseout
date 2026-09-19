import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  const { data: connection, error } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .eq("provider", "instagram")
    .eq("status", "connected")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!connection?.id) return NextResponse.json({ error: "Connect Instagram first." }, { status: 409 });

  try {
    const result = await ingestSocialMetrics(connection.id);
    return NextResponse.json({ ok: result.errors === 0, ...result });
  } catch (caught) {
    return NextResponse.json({ error: caught instanceof Error ? caught.message : "Instagram insights sync failed." }, { status: 500 });
  }
}
