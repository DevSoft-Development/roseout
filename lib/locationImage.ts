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
      "#",
      "?",
    ].includes(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("default-image") ||
    normalized.includes("/placeholder")
  );
}

function isPotentialImageUrl(value: string) {
  const src = value.trim();
  const lower = src.toLowerCase();

  if (!src) return false;
  if (
    [
      "null",
      "undefined",
      "none",
      "n/a",
      "missing",
      "no image",
      "no-image",
      "#",
      "?",
    ].includes(lower)
  ) {
    return false;
  }
  if (lower.includes("placeholder") || lower.includes("default-image")) {
    return false;
  }

  if (src.startsWith("/")) return src.length > 1;
  if (src.startsWith("http://")) return src.length > "http://".length;
  if (src.startsWith("https://")) return src.length > "https://".length;

  return false;
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
        .find((item) => !isBadImageValue(item) && isPotentialImageUrl(item)) || null
    );
  }

  if (typeof value === "object") {
    const record = value as any;

    return firstImage(
      record.url ||
        record.src ||
        record.image_url ||
        record.main_image ||
        record.publicUrl ||
        record.public_url,
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

export function hasUsableLocationImage(location: any) {
  return Boolean(getLocationImage(location));
}
