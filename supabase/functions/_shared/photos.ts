const BAD_VALUES = new Set(["", "null", "undefined", "none", "n/a", "#", "?"]);

export function isValidPhotoUrl(value: unknown) {
  const url = String(value ?? "").trim();
  const lower = url.toLowerCase();
  if (BAD_VALUES.has(lower)) return false;
  if (lower.includes("placeholder")) return false;
  return /^https?:\/\//i.test(url) || lower.startsWith("/storage/") || lower.startsWith("/images/");
}

export function hasValidPhoto(item: any) {
  return item?.has_photos === true || item?.photo_status === "has_photo" || isValidPhotoUrl(item?.image_url) || isValidPhotoUrl(item?.photo_url);
}
