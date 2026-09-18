const TRAILING_PUNCTUATION = /[),.;:!?]+$/;

export type UrlToken = {
  type: "url";
  text: string;
  href: string;
};

export type TextToken = {
  type: "text";
  text: string;
};

export type CaptionToken = UrlToken | TextToken;

export function normalizeUrlHref(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

export function shortenDisplayedLink(url: string, maxLength = 34) {
  const href = normalizeUrlHref(url.trim());

  try {
    const parsed = new URL(href);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const normalizedPath = path === "/" ? "" : path.replace(/\/$/, "");
    const display = `${host}${normalizedPath}`;

    if (display.length <= maxLength) return display;

    const firstPathSegment = parsed.pathname.split("/").filter(Boolean)[0];
    if (firstPathSegment && `${host}/${firstPathSegment}`.length <= maxLength) {
      return `${host}/${firstPathSegment}/...`;
    }

    return `${host}/...`;
  } catch {
    return url.length > maxLength ? `${url.slice(0, Math.max(0, maxLength - 3))}...` : url;
  }
}

export function tokenizeCaptionLinks(caption: string): CaptionToken[] {
  const tokens: CaptionToken[] = [];
  const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlPattern.exec(caption)) !== null) {
    const raw = match[0];
    const punctuationMatch = raw.match(TRAILING_PUNCTUATION);
    const punctuation = punctuationMatch?.[0] || "";
    const cleanUrl = punctuation ? raw.slice(0, -punctuation.length) : raw;
    const start = match.index;
    const cleanEnd = start + cleanUrl.length;

    if (start > lastIndex) {
      tokens.push({ type: "text", text: caption.slice(lastIndex, start) });
    }

    tokens.push({ type: "url", text: cleanUrl, href: normalizeUrlHref(cleanUrl) });

    if (punctuation) {
      tokens.push({ type: "text", text: punctuation });
    }

    lastIndex = cleanEnd + punctuation.length;
  }

  if (lastIndex < caption.length) {
    tokens.push({ type: "text", text: caption.slice(lastIndex) });
  }

  return tokens;
}
