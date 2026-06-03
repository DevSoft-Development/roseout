const BAD_VALUES = new Set(["", "null", "undefined", "none", "n/a", "na", "#", "?"]);
const REJECT_PATTERNS = [
  /placeholder/i,
  /missing[-_ ]?photo/i,
  /no[-_ ]?photo/i,
  /needs[-_ ]?photo/i,
];

function validUrl(value: unknown): boolean {
  const text = String(value ?? "").trim();
  const lower = text.toLowerCase();

  if (BAD_VALUES.has(lower)) return false;
  if (REJECT_PATTERNS.some((pattern) => pattern.test(text))) return false;

  return text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/");
}

function collectPhotoValues(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPhotoValues(item));
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((item) =>
      collectPhotoValues(item)
    );
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return collectPhotoValues(JSON.parse(trimmed));
      } catch {
        // Fall through and treat the original string as a delimited value.
      }
    }

    return trimmed
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [value];
}

export function hasValidPhoto(item: Record<string, unknown>): boolean {
  return [
    item?.image_url,
    item?.photo_url,
    item?.main_image,
    item?.images,
    item?.gallery_images,
    item?.photos,
  ]
    .flatMap((value) => collectPhotoValues(value))
    .some((value) => validUrl(value));
}
