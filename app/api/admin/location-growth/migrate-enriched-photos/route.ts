import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode =
  | "google_endpoint_to_storage"
  | "repair_missing_completed"
  | "repair_bad_placeholders";

function isGooglePlacesPhotoEndpoint(value: unknown) {
  if (typeof value !== "string") return false;
  const lower = value.toLowerCase();
  return (
    lower.includes("maps.googleapis.com/maps/api/place/photo") &&
    lower.includes("photo_reference=")
  );
}

function isBadPhotoValue(value: unknown) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (!trimmed) return true;

  return (
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "na",
      "placeholder",
      "placeholder.jpg",
      "/placeholder.jpg",
      "#",
      "?",
    ].includes(lower) ||
    lower.includes("placeholder") ||
    lower.includes("missing") ||
    lower.includes("no-image") ||
    lower.includes("no_image") ||
    lower.includes("default-image") ||
    lower.includes("default_image")
  );
}

async function uploadRemoteImageToSupabase(locationId: string, imageUrl: string) {
  const photoRes = await fetch(imageUrl, {
    redirect: "follow",
    cache: "no-store",
  });

  if (!photoRes.ok) {
    throw new Error(`Remote photo download failed: ${photoRes.status}`);
  }

  const contentType = photoRes.headers.get("content-type") || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error(`Remote photo returned invalid content type: ${contentType}`);
  }

  const arrayBuffer = await photoRes.arrayBuffer();

  if (arrayBuffer.byteLength < 1024) {
    throw new Error("Remote photo was too small to be valid.");
  }

  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";

  const storagePath = `locations/${locationId}/primary-google.${extension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("location-images")
    .upload(storagePath, Buffer.from(arrayBuffer), {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadError) {
    throw new Error(`Supabase photo upload failed: ${uploadError.message}`);
  }

  const { data } = supabaseAdmin.storage
    .from("location-images")
    .getPublicUrl(storagePath);

  if (!data.publicUrl) {
    throw new Error("Supabase did not return a public URL.");
  }

  return {
    imageUrl: data.publicUrl,
    storagePath,
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode || "google_endpoint_to_storage") as Mode;
  const limit = Math.min(Math.max(Number(body.limit || 50), 1), 250);

  let processed = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const errors: Array<{ id: string; message: string }> = [];

  if (mode === "google_endpoint_to_storage") {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,main_image,image_url,has_photos,photo_status")
      .is("deleted_at", null)
      .eq("has_photos", true)
      .in("photo_status", ["google_photo", "has_photo", "imported_photo"])
      .ilike("main_image", "%maps.googleapis.com/maps/api/place/photo%")
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    for (const row of data || []) {
      processed += 1;

      try {
        if (!isGooglePlacesPhotoEndpoint(row.main_image)) {
          skipped += 1;
          continue;
        }

        const uploaded = await uploadRemoteImageToSupabase(
          row.id,
          row.main_image,
        );

        const { error: updateError } = await supabaseAdmin
          .from("locations")
          .update({
            main_image: uploaded.imageUrl,
            image_url: uploaded.imageUrl,
            gallery_images: [uploaded.imageUrl],
            has_photos: true,
            photo_status: "google_photo",
            photo_source: "google_places",
            photo_storage_path: uploaded.storagePath,
            photo_backfilled_at: new Date().toISOString(),
            photo_backfill_error: null,
          })
          .eq("id", row.id);

        if (updateError) throw updateError;

        await supabaseAdmin.from("location_photo_backfill_logs").insert({
          location_id: row.id,
          status: "success",
          source: "google_places",
          message: "Migrated existing Google photo endpoint to Supabase Storage.",
          photo_url: uploaded.imageUrl,
          storage_path: uploaded.storagePath,
        });

        updated += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ id: row.id, message });

        await supabaseAdmin
          .from("locations")
          .update({
            photo_backfill_error: message,
            photo_backfilled_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await supabaseAdmin.from("location_photo_backfill_logs").insert({
          location_id: row.id,
          status: "failed",
          source: "google_places",
          message,
        });
      }
    }
  } else if (mode === "repair_missing_completed") {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,quality_score,has_photos,photo_status,main_image,image_url")
      .is("deleted_at", null)
      .eq("enrichment_status", "completed")
      .or("has_photos.eq.false,photo_status.eq.missing_photo,main_image.is.null,image_url.is.null")
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    for (const row of data || []) {
      processed += 1;

      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update({
          enrichment_status: "queued",
          enrichment_priority: Math.max(Number(row.quality_score || 0), 90),
          has_photos: false,
          photo_status: "missing_photo",
          is_searchable: false,
          data_status: "needs_review",
          photo_backfill_error: null,
        })
        .eq("id", row.id);

      if (updateError) {
        failed += 1;
        errors.push({ id: row.id, message: updateError.message });
      } else {
        updated += 1;
      }
    }
  } else if (mode === "repair_bad_placeholders") {
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,main_image,image_url,quality_score")
      .is("deleted_at", null)
      .or(
        [
          "main_image.ilike.%placeholder%",
          "image_url.ilike.%placeholder%",
          "main_image.ilike.%no-image%",
          "image_url.ilike.%no-image%",
          "main_image.ilike.%no_image%",
          "image_url.ilike.%no_image%",
          "main_image.ilike.%default-image%",
          "image_url.ilike.%default-image%",
          "main_image.ilike.%default_image%",
          "image_url.ilike.%default_image%",
          "main_image.in.(null,undefined,none,n/a,na,#,?,placeholder.jpg,/placeholder.jpg)",
          "image_url.in.(null,undefined,none,n/a,na,#,?,placeholder.jpg,/placeholder.jpg)",
        ].join(","),
      )
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    for (const row of data || []) {
      processed += 1;

      const hasBadMain = isBadPhotoValue(row.main_image);
      const hasBadImage = isBadPhotoValue(row.image_url);

      if (!hasBadMain && !hasBadImage) {
        skipped += 1;
        continue;
      }

      const updatePayload: Record<string, unknown> = {
        main_image: null,
        image_url: null,
        gallery_images: null,
        has_photos: false,
        photo_status: "missing_photo",
        is_searchable: false,
        data_status: "needs_review",
        photo_backfill_error: null,
      };

      if (Number(row.quality_score || 0) >= 75) {
        updatePayload.enrichment_status = "queued";
      }

      const { error: updateError } = await supabaseAdmin
        .from("locations")
        .update(updatePayload)
        .eq("id", row.id);

      if (updateError) {
        failed += 1;
        errors.push({ id: row.id, message: updateError.message });
      } else {
        updated += 1;
      }
    }
  } else {
    return NextResponse.json(
      { success: false, error: "Invalid migration mode." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    success: true,
    mode,
    limit,
    processed,
    updated,
    failed,
    skipped,
    errors,
  });
}
