export type UnresolvedAnchorFallbackInput = {
  rawAnchorText: string;
  requestedDomain: "restaurant" | "activity";
  qualifier?: string | null;
};

export function buildUnresolvedAnchorFallbackQuery({
  rawAnchorText,
  requestedDomain,
  qualifier,
}: UnresolvedAnchorFallbackInput) {
  const anchorText = String(rawAnchorText || "").trim();
  if (!anchorText) return null;

  const requestedIntent =
    String(qualifier || "").trim() ||
    (requestedDomain === "restaurant" ? "dinner" : "something fun");

  return `${requestedIntent} and ${anchorText}`.replace(/\s+/g, " ").trim();
}
