// Server-only photo service. Do not import this from client components.
import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { dedupeLocationPhotos } from "@/lib/locations/photo-public";

export async function getLocationPhotos(locationId: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id, main_image, image_url, images, gallery_images, photos, primary_photo_url, google_photo_url, cached_photo_url",
    )
    .eq("id", locationId)
    .maybeSingle();

  if (error) throw error;
  return dedupeLocationPhotos([
    data?.main_image,
    data?.image_url,
    data?.primary_photo_url,
    data?.google_photo_url,
    data?.cached_photo_url,
    ...(Array.isArray(data?.images) ? data.images : []),
    ...(Array.isArray(data?.gallery_images) ? data.gallery_images : []),
    ...(Array.isArray(data?.photos) ? data.photos : []),
  ]);
}

export const getEditableLocationPhotos = getLocationPhotos;
