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
    return trimmed.split(/[\n,]+/).map((item) => item.trim()).find(Boolean) || null;
  }
  if (typeof value === "object") return firstImage((value as any).url || (value as any).src);
  return null;
}

export function getLocationImage(location: any) {
  return (
    location?.main_image ||
    location?.image_url ||
    firstImage(location?.gallery_images) ||
    firstImage(location?.gallery) ||
    firstImage(location?.photos) ||
    firstImage(location?.image_gallery) ||
    firstImage(location?.images) ||
    "/placeholder.jpg"
  );
}
