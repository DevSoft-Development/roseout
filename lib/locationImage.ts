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
        return firstImage(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }

    return (
      trimmed
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .find((item) => {
          if (isBadImageValue(item)) return false;
          if (item.length <= 8) return false;
          return /^https?:\/\//i.test(item) || item.startsWith("/");
        }) || null
    );
  }

  if (typeof value === "object") {
    const record = value as any;

    return firstImage(
      record.url ||
        record.src ||
        record.image_url ||
        record.main_image ||
        record.photo_url ||
        record.primary_photo_url ||
        record.google_photo_url ||
        record.image ||
        record.publicUrl ||
        record.public_url ||
        record.secure_url ||
        record.original_url ||
        record.large_url ||
        record.medium_url ||
        record.thumbnail_url ||
        record.photoReference ||
        record.photo_reference,
    );
  }

  return null;
}

export function getLocationImage(location: any) {
  return (
    firstImage(location?.main_image) ||
    firstImage(location?.image_url) ||
    firstImage(location?.photo_url) ||
    firstImage(location?.primary_photo_url) ||
    firstImage(location?.google_photo_url) ||
    firstImage(location?.image) ||
    firstImage(location?.gallery_images) ||
    firstImage(location?.gallery) ||
    firstImage(location?.photos) ||
    firstImage(location?.image_gallery) ||
    firstImage(location?.images) ||
    null
  );
}

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
