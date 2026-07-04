export function cleanPhotoString(value: unknown) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

export function normalizePhotoUrl(value: unknown) {
  const raw = cleanPhotoString(value);
  if (!raw) return "";
  if (/^(null|undefined|n\/a|na|none|false|missing|no image|no-image)$/i.test(raw)) return "";
  if (/placeholder|default-image|photo-coming-soon|\/placeholder/i.test(raw)) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (/^http:\/\//i.test(raw)) return raw.replace(/^http:\/\//i, "https://");
  return raw;
}

export function isLikelyValidImageUrl(value: unknown) {
  const url = normalizePhotoUrl(value);
  if (!url || /\s/.test(url)) return false;
  if (/^(blob|javascript|file):/i.test(url)) return false;
  if (url.startsWith("/")) return !url.startsWith("//") && url.length > 1;
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return Boolean(parsed.hostname) && parsed.hostname.includes(".");
  } catch {
    return false;
  }
}

export function getPhotoDedupeKey(value: unknown, extra?: { storagePath?: string | null; googlePhotoReference?: string | null }) {
  const storagePath = cleanPhotoString(extra?.storagePath).toLowerCase();
  if (storagePath) return `storage:${storagePath.replace(/^\/+|\/+$/g, "")}`;

  const explicitRef = cleanPhotoString(extra?.googlePhotoReference);
  if (explicitRef) return `google-ref:${explicitRef}`;

  const url = normalizePhotoUrl(value);
  if (!url) return "";

  try {
    const parsed = new URL(url, "https://theouthaven.local");
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    const ref = parsed.searchParams.get("photo_reference") || parsed.searchParams.get("photoreference") || parsed.searchParams.get("ref");
    if (ref && (host === "maps.googleapis.com" || path.includes("/api/public/google-place-photo"))) return `google-ref:${ref.trim()}`;
    const placeId = parsed.searchParams.get("placeId") || parsed.searchParams.get("place_id");
    if (placeId && path.includes("/api/public/google-place-photo")) return `google-place:${placeId.trim()}`;
    parsed.protocol = "https:";
    parsed.hash = "";
    for (const key of ["key", "maxwidth", "maxheight", "width", "height", "cache", "t"]) parsed.searchParams.delete(key);
    return parsed.toString().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  }
}
