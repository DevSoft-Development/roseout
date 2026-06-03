const BAD_VALUES = new Set(["", "null", "undefined", "none", "n/a", "na", "#", "?"]);
const PLACEHOLDER_PATTERNS = [/placeholder/i, /no[-_ ]?image/i, /missing[-_ ]?photo/i, /default[-_ ]?image/i, /blank\.(png|jpg|jpeg|webp)$/i];

function validUrl(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (BAD_VALUES.has(text.toLowerCase())) return false;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (text.startsWith("/placeholder")) return false;
  if (text.startsWith("/")) return text.length > 1;
  if (!text.startsWith("http://") && !text.startsWith("https://")) return false;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function validImageList(value: unknown): boolean {
  if (!value) return false;
  if (Array.isArray(value)) return value.some((item) => validImageList(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return validUrl(record.url) || validUrl(record.src) || validUrl(record.image_url) || validUrl(record.main_image);
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return false;
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
      try {
        return validImageList(JSON.parse(text));
      } catch {
        return false;
      }
    }
    return text.split(/[\n,]+/).some((part) => validUrl(part));
  }
  return false;
}

export function hasValidPhoto(item: Record<string, unknown>): boolean {
  if (!item) return false;
  const status = String(item.photo_status ?? "").toLowerCase();
  if (status === "missing_photo" || status === "no_photo" || status === "needs_photo") return false;

  return (
    validUrl(item.image_url) ||
    validUrl(item.photo_url) ||
    validUrl(item.main_image) ||
    validImageList(item.images) ||
    validImageList(item.gallery_images) ||
    validImageList(item.photos)
  );
}
