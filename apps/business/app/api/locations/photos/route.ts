import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeLocationPhotoList } from "@/lib/locations/photo-public";

function clean(value: unknown) {
  return String(value || "").trim();
}

function dedupe(values: unknown[]) {
  return normalizeLocationPhotoList(values).map((photo) => photo.url);
}

export async function PATCH(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const locationId = clean(body.locationId);
  const action = clean(body.action);
  if (!locationId || !action) {
    return Response.json({ ok: false, error: "Missing locationId or action." }, { status: 400 });
  }

  const { access, error } = await requireLocationPermission({
    locationId,
    permission: "photos.upload",
    request,
    allowDemoPreview: true,
  });
  if (error) return error;
  const canonicalId = access.canonicalLocationId || locationId;

  const { data: current, error: currentError } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", canonicalId)
    .maybeSingle();
  if (currentError || !current) {
    return Response.json({ ok: false, error: "Location not found." }, { status: 404 });
  }

  const currentOwnerPhotos = dedupe(
    Array.isArray(current.owner_photo_urls) ? current.owner_photo_urls : [],
  );
  const currentPrimary = clean(current.owner_primary_photo_url);
  const now = new Date().toISOString();
  let ownerPhotoUrls = [...currentOwnerPhotos];
  let ownerPrimaryPhotoUrl = currentPrimary || ownerPhotoUrls[0] || null;

  if (action === "set_primary") {
    const url = clean(body.url);
    if (!url || !ownerPhotoUrls.includes(url)) {
      return Response.json({ ok: false, error: "Choose one of your uploaded photos." }, { status: 400 });
    }
    ownerPrimaryPhotoUrl = url;
    ownerPhotoUrls = [url, ...ownerPhotoUrls.filter((item) => item !== url)];
  } else if (action === "reorder") {
    const requested = Array.isArray(body.urls) ? dedupe(body.urls) : [];
    if (!requested.length || requested.some((url) => !ownerPhotoUrls.includes(url))) {
      return Response.json({ ok: false, error: "Photo order is invalid." }, { status: 400 });
    }
    ownerPhotoUrls = [
      ...requested,
      ...ownerPhotoUrls.filter((url) => !requested.includes(url)),
    ];
    if (!ownerPrimaryPhotoUrl || !ownerPhotoUrls.includes(ownerPrimaryPhotoUrl)) {
      ownerPrimaryPhotoUrl = ownerPhotoUrls[0] || null;
    }
  } else if (action === "remove") {
    const url = clean(body.url);
    if (!url || !ownerPhotoUrls.includes(url)) {
      return Response.json({ ok: false, error: "Photo not found." }, { status: 404 });
    }
    ownerPhotoUrls = ownerPhotoUrls.filter((item) => item !== url);
    if (ownerPrimaryPhotoUrl === url) ownerPrimaryPhotoUrl = ownerPhotoUrls[0] || null;
  } else {
    return Response.json({ ok: false, error: "Unsupported photo action." }, { status: 400 });
  }

  const existingImages = Array.isArray(current.images) ? current.images : [];
  const preservedImages = dedupe(existingImages).filter((url) => !currentOwnerPhotos.includes(url));
  const combinedImages = dedupe([...ownerPhotoUrls, ...preservedImages]);
  const nextHero = ownerPrimaryPhotoUrl || clean(current.main_image) || clean(current.image_url) || null;

  const { error: updateError } = await supabaseAdmin
    .from("locations")
    .update({
      owner_photo_urls: ownerPhotoUrls,
      owner_primary_photo_url: ownerPrimaryPhotoUrl,
      main_image: nextHero,
      image_url: nextHero,
      images: combinedImages,
      gallery_images: combinedImages,
      photos: combinedImages,
      photo_status: ownerPhotoUrls.length ? "owner_photo" : current.photo_status,
      photo_source: ownerPhotoUrls.length ? "owner_upload" : current.photo_source,
      profile_last_owner_update_at: access.isAdmin ? current.profile_last_owner_update_at : now,
      profile_managed_by: access.isAdmin ? current.profile_managed_by : "owner",
      profile_manual_lock: access.isAdmin ? current.profile_manual_lock : true,
      updated_at: now,
    })
    .eq("id", canonicalId);

  if (updateError) {
    return Response.json({ ok: false, error: "Could not update photos." }, { status: 500 });
  }

  await Promise.allSettled([
    supabaseAdmin.from("admin_system_logs").insert({
      level: "info",
      category: "crm",
      action: `location_photo_${action}`,
      message: `Updated owner photos for ${canonicalId}`,
      actor_user_id: access.userId || null,
      actor_email: access.userEmail || null,
      entity_type: "location",
      entity_id: canonicalId,
      metadata: { action, ownerPhotoCount: ownerPhotoUrls.length },
    }),
    !access.isAdmin
      ? supabaseAdmin.from("claim_funnel_events").insert({
          location_id: canonicalId,
          event_type: `owner_photo_${action}`,
          metadata: {
            owner_photo_count: ownerPhotoUrls.length,
            recommended_minimum: 3,
            gallery_complete_target: 5,
          },
        })
      : Promise.resolve(),
  ]);

  return Response.json({
    ok: true,
    ownerPhotoUrls,
    ownerPrimaryPhotoUrl,
    ownerPhotoCount: ownerPhotoUrls.length,
    recommendedMinimumReached: ownerPhotoUrls.length >= 3,
    galleryComplete: ownerPhotoUrls.length >= 5,
  });
}
