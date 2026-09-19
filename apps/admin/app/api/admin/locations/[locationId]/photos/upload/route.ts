import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { ADMIN_LOCATION_ENRICHMENT_FIELDS } from "@/lib/admin/location-data-projections";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { normalizeLocationPhotoList } from "@/lib/locations/photo-public";

const BUCKET = "location-images";
const MAX_SIZE = 8 * 1024 * 1024;
function safeFilename(name: string) { return ((name || "image").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "image"); }
function dedupe(values: unknown[]) { return normalizeLocationPhotoList(values).map((photo) => photo.url); }

export async function POST(request: Request, context: { params: Promise<{ locationId: string }> }) {
  const { locationId: rawLocationId } = await context.params;
  const locationId = String(rawLocationId || "").trim();
  if (!locationId) return Response.json({ ok: false, error: "Missing locationId." }, { status: 400 });
  const { access, error } = await requireLocationPermission({ locationId, permission: "photos.upload", request, allowDemoPreview: true });
  if (error) return error;
  const uploadLocationId = access.canonicalLocationId || locationId;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const imageType = String(formData.get("imageType") || "gallery").slice(0, 40);
    if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ ok: false, error: "Image must be smaller than 8MB." }, { status: 400 });

    const filename = safeFilename(file.name);
    const storagePath = `locations/${uploadLocationId}/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const { data: currentLocation } = await supabaseAdmin.from("locations").select(ADMIN_LOCATION_ENRICHMENT_FIELDS).eq("id", uploadLocationId).maybeSingle();

    const existingImages = Array.isArray(currentLocation?.images) ? currentLocation.images : [];
    const galleryImages = dedupe([data.publicUrl, ...existingImages]);
    const isMainUpload = ["main", "primary", "hero"].includes(imageType.toLowerCase());
    const isOwnerUpload = !access.isAdmin && !access.isSuperadmin && access.source !== "demo";
    const existingOwnerPhotos = Array.isArray(currentLocation?.owner_photo_urls) ? currentLocation.owner_photo_urls : [];
    const ownerPhotoUrls = isOwnerUpload ? dedupe([data.publicUrl, ...existingOwnerPhotos]) : dedupe(existingOwnerPhotos);
    const currentOwnerPrimary = String(currentLocation?.owner_primary_photo_url || "").trim();
    const ownerPrimaryPhotoUrl = isOwnerUpload ? (isMainUpload || !currentOwnerPrimary ? data.publicUrl : currentOwnerPrimary) : currentOwnerPrimary || null;
    const currentMain = String(currentLocation?.main_image || currentLocation?.image_url || "").trim();
    const ownerShouldControlHero = isOwnerUpload && (isMainUpload || !currentOwnerPrimary || !currentMain);
    const nextMainImage = ownerShouldControlHero ? ownerPrimaryPhotoUrl || data.publicUrl : isMainUpload ? data.publicUrl : currentMain || data.publicUrl;
    const now = new Date().toISOString();
    const mergedLocation = { ...(currentLocation || {}), main_image: nextMainImage, image_url: nextMainImage, images: galleryImages, gallery_images: galleryImages, owner_photo_urls: ownerPhotoUrls, owner_primary_photo_url: ownerPrimaryPhotoUrl, photo_status: isOwnerUpload ? "owner_photo" : access.isAdmin ? "admin_photo" : "uploaded_photo" };
    const publishabilityUpdates = getPhotoPublishabilityUpdates(mergedLocation);
    const updatePayload: Record<string, unknown> = {
      main_image: mergedLocation.main_image, image_url: mergedLocation.image_url, images: galleryImages, gallery_images: galleryImages,
      ...publishabilityUpdates,
      photo_status: mergedLocation.photo_status, photo_source: isOwnerUpload ? "owner_upload" : access.isAdmin ? "admin_upload" : "upload", updated_at: now,
    };
    if (isOwnerUpload) {
      updatePayload.owner_photo_urls = ownerPhotoUrls;
      updatePayload.owner_primary_photo_url = ownerPrimaryPhotoUrl;
      updatePayload.profile_last_owner_update_at = now;
      updatePayload.profile_managed_by = "owner";
      updatePayload.profile_manual_lock = true;
    }
    const { error: locationUpdateError } = await supabaseAdmin.from("locations").update(updatePayload).eq("id", uploadLocationId);
    if (locationUpdateError) return Response.json({ ok: false, error: "Photo uploaded, but the profile could not be updated." }, { status: 500 });

    await Promise.allSettled([
      supabaseAdmin.from("admin_system_logs").insert({
        level: "info", category: "crm", source: "location_photo_uploaded", message: `Uploaded ${imageType} photo for ${uploadLocationId}`,
        actor_id: access.userId || null, actor_email: access.userEmail || null, entity_type: "location", entity_id: uploadLocationId,
        metadata: { bucket: BUCKET, path: storagePath, imageType, source: access.source, ownerPhotoCount: ownerPhotoUrls.length },
      }),
      isOwnerUpload ? supabaseAdmin.from("claim_funnel_events").insert({ location_id: uploadLocationId, event_type: "owner_photo_uploaded", metadata: { owner_photo_count: ownerPhotoUrls.length, recommended_minimum: 3, gallery_complete_target: 5, image_type: imageType } }) : Promise.resolve(),
    ]);

    return Response.json({ ok: true, url: data.publicUrl, path: storagePath, bucket: BUCKET, ownerPhotoCount: ownerPhotoUrls.length, ownerPrimaryPhotoUrl, galleryComplete: ownerPhotoUrls.length >= 5, recommendedMinimumReached: ownerPhotoUrls.length >= 3 });
  } catch {
    return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
  }
}
