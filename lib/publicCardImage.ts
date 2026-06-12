import { firstImage, getLocationImage } from "@/lib/locationImage";

export function normalizePublicCardImage<T extends Record<string, any>>(item: T): T {
  const image =
    getLocationImage(item) ||
    firstImage(item?.main_image) ||
    firstImage(item?.image_url) ||
    firstImage(item?.images) ||
    firstImage(item?.photos) ||
    firstImage(item?.gallery_images) ||
    firstImage(item?.gallery) ||
    firstImage(item?.image_gallery) ||
    firstImage(item?.google_photo_url) ||
    firstImage(item?.primary_photo_url) ||
    firstImage(item?.image);

  return {
    ...item,
    image_url: image || item?.image_url || null,
    main_image: image || item?.main_image || null,
    images: Array.isArray(item?.images)
      ? item.images
      : image
        ? [image]
        : item?.images || [],
    has_photos: Boolean(image || item?.has_photos),
    photo_status: image
      ? item?.photo_status || "has_photo"
      : item?.photo_status || "missing_photo",
  };
}

export function hasPublicCardImage(item: any) {
  return Boolean(getLocationImage(normalizePublicCardImage(item || {})));
}
