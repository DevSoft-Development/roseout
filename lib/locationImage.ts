function isValidImage(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (trimmed.length < 8) return false;

  const lower = trimmed.toLowerCase();

  if (
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
    ].includes(lower)
  ) {
    return false;
  }

  if (
    lower.includes("placeholder") ||
    lower.includes("missing") ||
    lower.includes("no-image") ||
    lower.includes("no_image") ||
    lower.includes("default-image") ||
    lower.includes("default_image")
  ) {
    return false;
  }

  return (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/") ||
    lower.includes("supabase") ||
    lower.includes("storage") ||
    lower.includes("googleusercontent") ||
    lower.includes("ggpht") ||
    lower.includes("googleapis") ||
    lower.includes("yelpcdn") ||
    lower.includes("cloudinary")
  );
}

function firstImage(value: unknown): string | null {
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
    if (!trimmed) return null;

    try {
      const parsed = JSON.parse(trimmed);
      const image = firstImage(parsed);
      if (image) return image;
    } catch {}

    return (
      trimmed
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .find(isValidImage) || null
    );
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    return (
      firstImage(record.url) ||
      firstImage(record.src) ||
      firstImage(record.image_url) ||
      firstImage(record.main_image) ||
      null
    );
  }

  return null;
}

export function getLocationImage(location: any) {
  return (
    firstImage(location?.main_image) ||
    firstImage(location?.image_url) ||
    firstImage(location?.gallery_images) ||
    firstImage(location?.gallery) ||
    firstImage(location?.photos) ||
    firstImage(location?.image_gallery) ||
    firstImage(location?.images) ||
    null
  );
}

export function hasLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}

export { isValidImage };
