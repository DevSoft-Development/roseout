export function normalizeClaimCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function extractClaimCodeFromQrValue(value: string) {
  const raw = value.trim();

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

    if (code) {
      return normalizeClaimCode(code);
    }
  } catch {
    // Fall through to raw code support.
  }

  return normalizeClaimCode(raw);
}

export function buildClaimUrlFromCode(code: string) {
  return `/business/claim?code=${encodeURIComponent(normalizeClaimCode(code))}`;
}
