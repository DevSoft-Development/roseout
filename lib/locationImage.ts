function isBadImageValue(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();

  return (
    !normalized ||
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "missing",
      "no image",
      "no-image",
      "photo coming soon",
      "coming soon",
      "#",
      "?",
    ].includes(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("default-image") ||
    normalized.includes("/placeholder") ||
    normalized.includes("photo-coming-soon")
  );
}

function isUsableImageUrl(value: string) {
  const trimmed = value.trim();

  if (isBadImageValue(trimmed)) return false;
  if (trimmed.length <= 8) return false;

  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("data:image/")
  );
}

export function firstImage(value: unknown): string | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImage(item);
      if (image) return image;
    }

    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (isBadImageValue(trimmed)) return null;

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        const image = firstImage(parsed);
        if (image) return image;
      } catch {
        // Continue and treat it as a plain string/URL below.
      }
    }

    const directValue = trimmed.split(/[\n,]+/).find((item) => {
      const candidate = item.trim();
      return isUsableImageUrl(candidate);
    });

    return directValue?.trim() || null;
  }

  if (typeof value === "object") {
    const record = value as any;

    return (
      firstImage(record.url) ||
      firstImage(record.src) ||
      firstImage(record.image_url) ||
      firstImage(record.main_image) ||
      firstImage(record.photo_url) ||
      firstImage(record.primary_photo_url) ||
      firstImage(record.google_photo_url) ||
      firstImage(record.image) ||
      firstImage(record.publicUrl) ||
      firstImage(record.public_url) ||
      firstImage(record.secure_url) ||
      firstImage(record.original_url) ||
      firstImage(record.large_url) ||
      firstImage(record.medium_url) ||
      firstImage(record.thumbnail_url) ||
      firstImage(record.photoReference) ||
      firstImage(record.photo_reference) ||
      null
    );
  }

  return null;
}

export function getLocationImage(location: any) {
  if (!location) return null;

  const projectImageFromImages = Array.isArray(location.images)
    ? location.images.find((item: unknown) =>
        String(item || "").includes("/storage/v1/object/public/location-images/"),
      )
    : null;

  return (
    firstImage(projectImageFromImages) ||
    firstImage(location.main_image) ||
    firstImage(location.image_url) ||
    firstImage(location.photo_url) ||
    firstImage(location.primary_photo_url) ||
    firstImage(location.google_photo_url) ||
    firstImage(location.image) ||
    firstImage(location.images) ||
    firstImage(location.photos) ||
    firstImage(location.gallery_images) ||
    firstImage(location.gallery) ||
    firstImage(location.image_gallery) ||
    null
  );
}

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
