export const CHAIN_BRANDS = [
  "mcdonalds",
  "starbucks",
  "dunkin",
  "subway",
  "burger king",
  "wendys",
  "taco bell",
  "chipotle",
  "popeyes",
  "kfc",
  "domino",
  "pizza hut",
  "panera",
  "shake shack",
  "chick fil a",
  "five guys",
  "jersey mikes",
  "panda express",
  "sweetgreen",
  "cava",
  "pret a manger",
  "au bon pain",
  "7 eleven",
  "ihop",
  "dennys",
  "applebees",
  "olive garden",
  "buffalo wild wings",
];

function normalize(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, "");
}

const BRAND_MATCHERS = CHAIN_BRANDS.map((brand) => ({
  brand,
  normalized: normalize(brand),
  compact: compact(brand),
}));

export function detectChainBrand(name: string): {
  isChain: boolean;
  chainBrand: string | null;
} {
  const normalizedName = normalize(name);
  const compactName = compact(name);
  if (!normalizedName) return { isChain: false, chainBrand: null };

  const match = BRAND_MATCHERS.find(({ normalized, compact: compactBrand }) => {
    const wordMatch = new RegExp(
      `(^|\\s)${normalized.replace(/\s+/g, "\\s+")}(\\s|$)`,
    ).test(normalizedName);
    return wordMatch || compactName.includes(compactBrand);
  });

  return match
    ? { isChain: true, chainBrand: match.brand }
    : { isChain: false, chainBrand: null };
}
