import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";
const COOKIE = "toh_superadmin_owner_mode_location";
const MAX_AGE = 60 * 30;
export async function POST(request: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.NEXT_PUBLIC_BUSINESS_SITE_URL || "https://business.theouthaven.com").origin;
  if (origin !== expected) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const microsoft = user.app_metadata?.provider === "azure" ||
    user.identities?.some(identity => identity.provider === "azure");
  if (!microsoft) return NextResponse.json({ error: "Microsoft staff sign-in required" }, { status: 403 });
  const access = await getLocationOwnerAccess(user.id, user.email);
  if (!access.isSuperadmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const locationId = typeof body?.locationId === "string" ? body.locationId : "";
  const clear = body?.action === "exit";
  if (!clear && !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(locationId))
    return NextResponse.json({ error: "Invalid location" }, { status: 400 });
  let location: {id:string;is_demo:boolean|null;is_hidden:boolean|null} | null = null;
  if (!clear) {
    const result = await supabaseAdmin.from("locations").select("id,is_demo,is_hidden")
      .eq("id", locationId).maybeSingle();
    if (result.error || !result.data || result.data.is_demo || result.data.is_hidden)
      return NextResponse.json({ error: "Location not eligible for owner mode" }, { status: 404 });
    location = result.data;
  }
  // Audit must succeed before issuing the owner-mode cookie.
  const { error: auditError } = await supabaseAdmin.from("admin_system_logs").insert({
    category: "Impersonation",
    level: "info",
    message: clear ? "Superadmin exited Business owner mode." : "Superadmin entered Business owner mode.",
    actor_id: user.id,
    actor_email: user.email || null,
    entity_type: clear ? "business_owner_mode_exit" : "business_owner_mode_enter",
    entity_id: location?.id || null,
    metadata: { actor_user_id: user.id, location_id: location?.id || null, source: "business_ms365" },
  });
  if (auditError) return NextResponse.json({ error: "Audit unavailable" }, { status: 503 });
  const response = NextResponse.json({ ok: true, redirectTo: "/locations/dashboard" });
  response.cookies.set(COOKIE, clear ? "" : location!.id, {
    secure: true, httpOnly: true, sameSite: "lax", path: "/", maxAge: clear ? 0 : MAX_AGE,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
