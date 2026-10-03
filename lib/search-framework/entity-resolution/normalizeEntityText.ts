const EXPANSIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bnyc\b/g, "new york"],
  [/\bmsg\b/g, "madison square garden"],
  [/\bmoma\b/g, "museum of modern art"],
  [/\bubs\b/g, "ubs arena"],
  [/\bcitifield\b/g, "citi field"],
  [/\blga\b/g, "laguardia airport"],
  [/\bjfk\b/g, "john f kennedy international airport"],
];

export function normalizeEntityText(value: string): string {
  let normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/\b(?:llc|inc|corp|corporation|company|co)\b\.?/g, " ");

  for (const [pattern, replacement] of EXPANSIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

export function entityTextSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.86;

  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  const overlap = [...aa].filter((token) => bb.has(token)).length;
  return overlap / Math.max(aa.size, bb.size);
}
