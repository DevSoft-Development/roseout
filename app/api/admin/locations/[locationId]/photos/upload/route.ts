import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { normalizeLocationPhotoList } from "@/lib/locations/photo-public";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
const BUCKET = "location-images";
const MAX_SIZE = 8 * 1024 * 1024;

function safeFilename(name: string) {
  return (name || "image")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "image";
}

export async function POST(request: Request, context: { params: Promise<{ locationId: string }> }) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (error) return error;
  const { locationId } = await context.params;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const imageType = String(formData.get("imageType") || "gallery");

    if (!(file instanceof File)) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ ok: false, error: "Image must be smaller than 8MB." }, { status: 400 });

    const filename = safeFilename(file.name);
    const storagePath = `locations/${locationId}/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadError) {
      return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: currentLocation } = await supabaseAdmin
      .from("locations")
      .select("*")
      .eq("id", locationId)
      .maybeSingle();

    const existingImages = Array.isArray(currentLocation?.images) ? currentLocation.images : [];
    const galleryImages = normalizeLocationPhotoList([data.publicUrl, ...existingImages]).map(
      (photo) => photo.url,
    );
    const isMainUpload = ["main", "primary", "hero"].includes(imageType.toLowerCase());
    const mergedLocation = {
      ...(currentLocation || {}),
      main_image: isMainUpload ? data.publicUrl : currentLocation?.main_image || data.publicUrl,
      image_url: isMainUpload ? data.publicUrl : currentLocation?.image_url || data.publicUrl,
      images: galleryImages,
      gallery_images: galleryImages,
      photos: galleryImages,
      photo_uploaded_by: "admin",
      photo_status: "admin_photo",
    };
    const publishabilityUpdates = getPhotoPublishabilityUpdates(mergedLocation);

    await supabaseAdmin
      .from("locations")
      .update({
        main_image: mergedLocation.main_image,
        image_url: mergedLocation.image_url,
        images: galleryImages,
        gallery_images: galleryImages,
        photos: galleryImages,
        ...publishabilityUpdates,
        photo_status: "admin_photo",
        updated_at: new Date().toISOString(),
      })
      .eq("id", locationId);

    await supabaseAdmin.from("admin_system_logs").insert({
      level: "info",
      category: "crm",
      action: "location_photo_uploaded",
      message: `Uploaded ${imageType} photo for ${locationId}`,
      actor_user_id: adminUser?.user_id || null,
      actor_email: adminUser?.email || null,
      entity_type: "location",
      entity_id: locationId,
      metadata: { bucket: BUCKET, path: storagePath, imageType },
    }).then(undefined, () => undefined);

    return Response.json({ ok: true, url: data.publicUrl, path: storagePath, bucket: BUCKET });
  } catch {
    return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
  }
}
