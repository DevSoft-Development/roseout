const CLAIM_SHORT_BASE_URL = "https://outhvn.com";

export function normalizeClaimCode(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function extractClaimCodeFromQrValue(value: string) {
  const raw = String(value || "").trim();

  try {
    const url =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : raw.startsWith("/")
          ? new URL(raw, window.location.origin)
          : null;

    const code =
      url?.searchParams.get("code") ||
      url?.searchParams.get("claimCode") ||
      url?.searchParams.get("claim_code");

    if (code) return normalizeClaimCode(code);

    if (url && /(^|\.)outhvn\.com$/i.test(url.hostname)) {
      const pathCode = decodeURIComponent(url.pathname.split("/").filter(Boolean)[0] || "");
      if (pathCode) return normalizeClaimCode(pathCode);
    }
  } catch {
    // Fall through to raw claim-code support.
  }

  return normalizeClaimCode(raw);
}

// Keep this relative path stable. Existing claim pages, QR repair jobs, and callers
// depend on it and previously issued theouthaven.com links must remain valid.
export function buildClaimUrlFromCode(code: string) {
  const normalized = normalizeClaimCode(code);
  return `/business/claim?code=${encodeURIComponent(normalized)}`;
}

// New branded form. This is additive: it redirects to the existing claim flow.
export function buildClaimShortUrlFromCode(code: string) {
  const normalized = normalizeClaimCode(code);
  return `${CLAIM_SHORT_BASE_URL}/${encodeURIComponent(normalized)}`;
}
