import { getBestLocationImage, getPublicLocationPhotosFromRecord } from "@/lib/locations/photos";

export function normalizePublicCardImage<T extends Record<string, any>>(item: T): T {
  const image = getBestLocationImage(item);
  const photos = getPublicLocationPhotosFromRecord(item).map((photo) => photo.url);
  return {
    ...item,
    image_url: image || null,
    main_image: image || null,
    images: photos,
    has_photos: Boolean(image),
    photo_status: image ? item?.photo_status || "has_photo" : "missing_photo",
  };
}

export function hasPublicCardImage(item: any) {
  return Boolean(getBestLocationImage(normalizePublicCardImage(item || {})));
}
