import { mobileConfig } from "@/lib/config";

export type MobileLinkTarget =
  | { kind: "short-link"; code: string }
  | { kind: "outing"; id: string }
  | { kind: "location"; id: string }
  | { kind: "unknown"; url: string };

function cleanSegment(value: string | undefined) {
  const decoded = value ? decodeURIComponent(value) : "";
  return decoded.trim() || null;
}

export function parseMobileLink(rawUrl: string): MobileLinkTarget {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split("/").filter(Boolean);

    if (url.origin === mobileConfig.shortLinkBaseUrl) {
      const code = cleanSegment(segments[0]);
      return code ? { kind: "short-link", code } : { kind: "unknown", url: rawUrl };
    }

    if (url.protocol === "theouthaven:") {
      const routeSegments = [url.hostname, ...segments].filter(Boolean);
      const [resource, id] = routeSegments;
      if (resource === "outing" && id) return { kind: "outing", id };
      if (resource === "location" && id) return { kind: "location", id };
    }

    if (url.origin === mobileConfig.siteUrl) {
      const [resource, id] = segments;
      if (resource === "outings" && id) return { kind: "outing", id };
      if (resource === "locations" && id) return { kind: "location", id };
    }

    return { kind: "unknown", url: rawUrl };
  } catch {
    return { kind: "unknown", url: rawUrl };
  }
}

export function buildShortLink(code: string) {
  return `${mobileConfig.shortLinkBaseUrl}/${encodeURIComponent(code)}`;
}
