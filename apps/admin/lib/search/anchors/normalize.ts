export function normalizeAnchorText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(?:llc|inc|corp|corporation|company|co)\b\.?/g, " ")
    .replace(/\bnyc\b/g, "new york")
    .replace(/\bmsg\b/g, "madison square garden")
    .replace(/\bmoma\b/g, "museum of modern art")
    .replace(/\bubs\b/g, "ubs arena")
    .replace(/\bcitifield\b/g, "citi field")
    .replace(/\blga\b/g, "laguardia airport")
    .replace(/\bjfk\b/g, "john f kennedy international airport")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

export function normalizeAliasList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeAnchorText(String(value))).filter(Boolean);
}
