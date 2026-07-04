import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { createClient } from "@/lib/supabase-server";
import { resolveSelectedLocationAccess } from "@/lib/auth/selectedLocationAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";

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
  const { locationId } = await context.params;

  try {
    const formData = await request.formData();
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.id) return Response.json({ ok: false, error: "Not signed in" }, { status: 401 });
    const selected = await resolveSelectedLocationAccess({ ...Object.fromEntries(formData.entries()), userId: user.id, locationId });
    if (!selected.ok) return Response.json({ ok: false, error: selected.message }, { status: selected.status });
    const adminRole = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
    const adminUser = adminRole.adminUser;
    const canonicalLocationId = selected.canonicalLocationId;
    const file = formData.get("file");
    const imageType = String(formData.get("imageType") || "gallery");

    if (!(file instanceof File)) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ ok: false, error: "Please choose an image file." }, { status: 400 });
    if (file.size > MAX_SIZE) return Response.json({ ok: false, error: "Image must be smaller than 8MB." }, { status: 400 });

    const filename = safeFilename(file.name);
    const storagePath = `locations/${canonicalLocationId}/${Date.now()}-${filename}`;
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
      .eq("id", canonicalLocationId)
      .maybeSingle();

    const existingImages = Array.isArray(currentLocation?.images) ? currentLocation.images : [];
    const galleryImages = [
      data.publicUrl,
      ...existingImages.filter((item: unknown) => String(item || "").trim() !== data.publicUrl),
    ];
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
      .eq("id", canonicalLocationId);

    await supabaseAdmin.from("admin_system_logs").insert({
      level: "info",
      category: "crm",
      action: "location_photo_uploaded",
      message: `Uploaded ${imageType} photo for ${canonicalLocationId}`,
      actor_user_id: adminUser?.user_id || null,
      actor_email: adminUser?.email || null,
      entity_type: "location",
      entity_id: canonicalLocationId,
      metadata: { bucket: BUCKET, path: storagePath, imageType },
    }).then(undefined, () => undefined);

    return Response.json({ ok: true, url: data.publicUrl, path: storagePath, bucket: BUCKET });
  } catch {
    return Response.json({ ok: false, error: "Upload failed. Please try again." }, { status: 500 });
  }
}
