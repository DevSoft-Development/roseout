import {
  firstImage,
  getLocationImage,
  normalizeImageUrlForPublic,
} from "@/lib/locationImage";

export function normalizePublicCardImage<T extends Record<string, any>>(item: T): T {
  const rawImage =
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

  const image = normalizeImageUrlForPublic(rawImage);

  return {
    ...item,
    image_url: image || null,
    main_image: image || null,
    images: image ? [image] : [],
    has_photos: Boolean(image),
    photo_status: image ? item?.photo_status || "has_photo" : "missing_photo",
  };
}

export function hasPublicCardImage(item: any) {
  return Boolean(getLocationImage(normalizePublicCardImage(item || {})));
}
