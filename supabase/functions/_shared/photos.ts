const BAD_VALUES = new Set(["", "null", "undefined", "none", "n/a", "na", "#", "?"]);
const PLACEHOLDER_PATTERNS = [/placeholder/i, /no[-_ ]?image/i, /missing[-_ ]?photo/i, /default[-_ ]?image/i, /blank\.(png|jpg|jpeg|webp)$/i];

function validUrl(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (BAD_VALUES.has(text.toLowerCase())) return false;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (text.startsWith("/placeholder")) return false;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function hasValidPhoto(item: Record<string, unknown>): boolean {
  if (item?.has_photos === true) return true;
  if (String(item?.photo_status ?? "").toLowerCase() === "has_photo") return true;
  return validUrl(item?.image_url) || validUrl(item?.photo_url) || validUrl(item?.main_image);
}
