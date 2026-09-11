import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthorizedWebsiteLocation } from "@/lib/websites/access";

const ALLOWED_ACTIONS = new Set([
  "acknowledge",
  "keep_pdf",
  "form_reviewed",
  "provider_confirmed",
  "redirect_confirmed",
]);

const ALLOWED_REDIRECT_TARGETS = new Set(["/", "/about/", "/menu/", "/reservations/", "/events/", "/gallery/", "/reviews/", "/visit/", "/contact/"]);
const ALLOWED_PROVIDERS = new Set(["Resy", "OpenTable", "SevenRooms", "Tock", "Toast Tables", "Yelp Reservations", "Quandoo", "External"]);

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function resolutionKey(item: any) {
  return String(item?.key || (item?.page_url ? `${item?.code}:${item.page_url}` : item?.code) || "").trim();
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Please log in to continue." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const locationId = String(body.location_id || "").trim();
  const key = String(body.key || "").trim();
  const action = String(body.action || "").trim();
  const value = String(body.value || "").trim();
  if (!locationId || !key || !ALLOWED_ACTIONS.has(action)) return NextResponse.json({ error: "Invalid migration resolution." }, { status: 400 });

  const location = await getAuthorizedWebsiteLocation(user, locationId, "id");
  if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404 });

  const { data: website, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,custom_content")
    .eq("location_id", locationId)
    .maybeSingle();
  if (error || !website) return NextResponse.json({ error: "Website not found." }, { status: 404 });

  const custom = website.custom_content && typeof website.custom_content === "object" ? website.custom_content as Record<string, any> : {};
  const imported = custom.website_import;
  if (!imported || typeof imported !== "object") return NextResponse.json({ error: "No imported website is waiting for review." }, { status: 409 });

  const exceptions = Array.isArray(imported.exceptions) ? imported.exceptions : [];
  const target = exceptions.find((item: any) => resolutionKey(item) === key);
  if (!target) return NextResponse.json({ error: "Migration item not found." }, { status: 404 });
  if (target.severity === "blocking") return NextResponse.json({ error: "This blocking item must be fixed by re-importing or correcting the source website." }, { status: 409 });

  if (action === "provider_confirmed" && !ALLOWED_PROVIDERS.has(value)) return NextResponse.json({ error: "Choose a supported reservation provider." }, { status: 400 });
  if (action === "redirect_confirmed" && !ALLOWED_REDIRECT_TARGETS.has(value)) return NextResponse.json({ error: "Choose a supported redirect destination." }, { status: 400 });

  const now = new Date().toISOString();
  const resolutions = imported.resolutions && typeof imported.resolutions === "object" ? { ...imported.resolutions } : {};
  resolutions[key] = { action, value: value || null, resolved_at: now, resolved_by: user.id };

  let migrationManifest = imported.migration_manifest;
  if (action === "redirect_confirmed" && target.page_url && migrationManifest && Array.isArray(migrationManifest.redirect_map)) {
    try {
      const pathname = new URL(target.page_url).pathname || "/";
      migrationManifest = {
        ...migrationManifest,
        redirect_map: migrationManifest.redirect_map.map((item: any) => item?.from === pathname ? { ...item, to: value } : item),
      };
    } catch {}
  }

  let reservationProvider = imported.reservation_provider;
  if (action === "provider_confirmed") reservationProvider = value;

  const unresolved = exceptions.filter((item: any) => !resolutions[resolutionKey(item)]);
  const nextImport = {
    ...imported,
    resolutions,
    migration_manifest: migrationManifest,
    reservation_provider: reservationProvider,
    blocking_exception_count: unresolved.filter((item: any) => item?.severity === "blocking").length,
    warning_exception_count: unresolved.filter((item: any) => item?.severity === "warning").length,
    review_status: imported.review_status === "approved" ? "pending" : imported.review_status,
    reviewed_at: imported.review_status === "approved" ? null : imported.reviewed_at,
    reviewed_by: imported.review_status === "approved" ? null : imported.reviewed_by,
  };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("business_websites")
    .update({ custom_content: { ...custom, website_import: nextImport }, updated_at: now })
    .eq("id", website.id)
    .select("id,custom_content")
    .single();
  if (updateError) return NextResponse.json({ error: "Unable to save migration resolution." }, { status: 500 });

  if (action === "provider_confirmed" && imported.reservation_url) {
    await supabaseAdmin.from("locations").update({ reservation_provider: value, updated_at: now }).eq("id", locationId);
  }

  return NextResponse.json({ ok: true, website: updated, unresolved_count: unresolved.length });
}
