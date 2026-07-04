import { createClient } from "@/lib/supabase-server";
import { resolveEditableLocationContext } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { dedupeLocationPhotos, normalizeLocationPhotoList } from "@/lib/locations/photos";

const BUCKET = "location-images";
const MAX_SIZE = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return (name || "image").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9._-]/g, "").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "image";
}

export async function POST(request: Request, context: { params: Promise<{ locationId: string }> }) {
  const { locationId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ ok: false, error: "Please sign in to upload location photos." }, { status: 401 });

  const accessContext = await resolveEditableLocationContext({ userId: user.id, locationId });
  if (!accessContext) return Response.json({ ok: false, error: "You do not have permission to manage photos for this location." }, { status: 403 });

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const imageType = String(formData.get("imageType") || "gallery");

    if (!(file instanceof File)) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ ok: false, error: "Image must be smaller than 8MB." }, { status: 400 });

    const canonicalLocationId = accessContext.canonicalLocationId;
    const filename = safeFilename(file.name);
    const storagePath = `locations/${canonicalLocationId}/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const currentLocation = accessContext.location;
    const existingPhotos = dedupeLocationPhotos(normalizeLocationPhotoList([currentLocation.images, currentLocation.gallery_images, currentLocation.photos], currentLocation as any));
    const galleryImages = dedupeLocationPhotos(normalizeLocationPhotoList([data.publicUrl, ...existingPhotos.map((photo) => photo.url)], currentLocation as any)).map((photo) => photo.url);
    const isMainUpload = ["main", "primary", "hero"].includes(imageType.toLowerCase());
    const actorKind = accessContext.isAdmin ? "admin" : "owner";
    const mergedLocation = {
      ...currentLocation,
      main_image: isMainUpload ? data.publicUrl : currentLocation?.main_image || data.publicUrl,
      image_url: isMainUpload ? data.publicUrl : currentLocation?.image_url || data.publicUrl,
      images: galleryImages,
      gallery_images: galleryImages,
      photos: galleryImages,
      photo_uploaded_by: actorKind,
      photo_status: accessContext.isAdmin ? "admin_photo" : "owner_photo",
    };
    const publishabilityUpdates = getPhotoPublishabilityUpdates(mergedLocation);

    await supabaseAdmin.from("locations").update({
      main_image: mergedLocation.main_image,
      image_url: mergedLocation.image_url,
      images: galleryImages,
      gallery_images: galleryImages,
      photos: galleryImages,
      ...publishabilityUpdates,
      photo_status: mergedLocation.photo_status,
      photo_uploaded_by: actorKind,
      updated_at: new Date().toISOString(),
    }).eq("id", canonicalLocationId);

    await supabaseAdmin.from("admin_system_logs").insert({
      level: "info",
      category: "crm",
      action: "location_photo_uploaded",
      message: `Uploaded ${imageType} photo for ${canonicalLocationId}`,
      actor_user_id: user.id,
      actor_email: user.email || null,
      entity_type: "location",
      entity_id: canonicalLocationId,
      metadata: { bucket: BUCKET, path: storagePath, imageType, actorKind },
    }).then(undefined, () => undefined);

    return Response.json({ ok: true, url: data.publicUrl, path: storagePath, bucket: BUCKET });
  } catch {
    return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
  }
}
