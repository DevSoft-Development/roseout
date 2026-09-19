import { requireLocationPermission } from "@/lib/auth/locationOwnerAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const BUCKET = "menu-item-images";
const MAX_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function safeFilename(name: string) {
  return (
    (name || "menu-item-image")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9._-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "menu-item-image"
  );
}

function toBoolean(value: FormDataEntryValue | null) {
  return value === "1" || value === "true";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const locationId = String(formData.get("locationId") || "").trim();
    const file = formData.get("file");

    if (!locationId) {
      return Response.json({ ok: false, message: "Missing locationId." }, { status: 400 });
    }

    const { access, error } = await requireLocationPermission({
      request,
      locationId,
      adminLocationId: String(formData.get("adminLocationId") || "") || null,
      demoLocationId: String(formData.get("demoLocationId") || "") || null,
      sourceId: String(formData.get("sourceId") || "") || null,
      type: String(formData.get("type") || "") || null,
      demo: toBoolean(formData.get("demo")),
      fromDemoCenter: toBoolean(formData.get("fromDemoCenter")),
      allowDemoPreview: true,
      permission: "menu.edit",
    });

    if (error) return error;

    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "Please choose an image file." }, { status: 400 });
    }

    if (!file.type.startsWith("image/") || !ALLOWED_TYPES.has(file.type)) {
      return Response.json({ ok: false, message: "Please choose a JPG, PNG, WebP, or GIF image." }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return Response.json({ ok: false, message: "Image must be smaller than 8MB." }, { status: 400 });
    }

    const canonicalLocationId = access.canonicalLocationId || locationId;
    const filename = safeFilename(file.name);
    const storagePath = `${canonicalLocationId}/${Date.now()}-${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return Response.json(
        { ok: false, message: "Upload failed. Confirm the menu-item-images bucket migration has run." },
        { status: 500 },
      );
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);

    await supabaseAdmin
      .from("admin_system_logs")
      .insert({
        level: "info",
        category: "menu",
        action: "menu_item_image_uploaded",
        message: `Uploaded menu item image for ${canonicalLocationId}`,
        actor_user_id: access.userId || null,
        actor_email: access.userEmail || null,
        entity_type: "location",
        entity_id: canonicalLocationId,
        metadata: { bucket: BUCKET, path: storagePath },
      })
      .then(undefined, () => undefined);

    return Response.json({ ok: true, url: data.publicUrl, path: storagePath, bucket: BUCKET });
  } catch {
    return Response.json({ ok: false, message: "Upload failed. Please try again." }, { status: 500 });
  }
}
