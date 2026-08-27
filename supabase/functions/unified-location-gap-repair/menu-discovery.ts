export const MENU_INTELLIGENCE_VERSION = "first_party_menu_v1";

const MENU_DISCOVERY_PATHS = [
  "/menu",
  "/menus",
  "/food",
  "/dining",
  "/dinner-menu",
  "/brunch-menu",
] as const;

const FETCH_TIMEOUT_MS = 7000;
const MAX_SAME_VENUE_REDIRECTS = 3;
const MAX_HTML_BYTES = 1_000_000;

const NON_CRAWLABLE_HOSTS = [
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
] as const;

const TRUSTED_MENU_HOSTS = [
  "order.toasttab.com",
  "toasttab.com",
  "square.site",
  "squareup.com",
  "getbento.com",
  "bentobox.com",
  "clover.com",
] as const;

const FOOD_TERMS: Record<string, string[]> = {
  steak: ["steak", "filet mignon", "ribeye", "rib eye", "new york strip", "tomahawk"],
  wings: ["wings", "chicken wings", "buffalo wings"],
  lobster: ["lobster", "lobster tail", "lobster roll"],
  crab: ["crab", "crab cake", "crab cakes", "king crab", "snow crab"],
  oysters: ["oyster", "oysters"],
  shrimp: ["shrimp", "prawns"],
  scallops: ["scallop", "scallops"],
  salmon: ["salmon"],
  sushi: ["sushi", "sashimi", "nigiri", "maki"],
  ramen: ["ramen"],
  pizza: ["pizza", "pizzeria"],
  burgers: ["burger", "burgers", "cheeseburger", "sliders"],
  pasta: ["pasta", "spaghetti", "rigatoni", "linguine", "fettuccine", "ravioli"],
  tacos: ["taco", "tacos", "taqueria"],
  bbq: ["bbq", "barbecue", "barbeque", "smoked brisket", "brisket"],
  ribs: ["ribs", "short ribs", "baby back ribs"],
  chicken: ["chicken", "fried chicken"],
  ceviche: ["ceviche"],
  dumplings: ["dumpling", "dumplings", "gyoza"],
  empanadas: ["empanada", "empanadas"],
  curry: ["curry"],
  biryani: ["biryani"],
  noodles: ["noodles", "lo mein", "pad thai"],
  pho: ["pho"],
  desserts: ["dessert", "desserts", "cake", "cheesecake", "tiramisu", "ice cream", "gelato"],
};

const DIETARY_TERMS: Record<string, string[]> = {
  halal: ["halal"],
  kosher: ["kosher"],
  vegan: ["vegan", "plant based", "plant-based"],
  vegetarian: ["vegetarian"],
  "gluten free": ["gluten free", "gluten-free"],
};

const MEAL_TERMS: Record<string, string[]> = {
  breakfast: ["breakfast"],
  brunch: ["brunch"],
  lunch: ["lunch"],
  dinner: ["dinner"],
  "happy hour": ["happy hour"],
};

const DRINK_TERMS: Record<string, string[]> = {
  cocktails: ["cocktail", "cocktails", "mixology"],
  martinis: ["martini", "martinis"],
  margaritas: ["margarita", "margaritas"],
  wine: ["wine", "wines"],
  beer: ["beer", "beers"],
  mocktails: ["mocktail", "mocktails", "zero proof", "zero-proof"],
};

const FEATURE_TERMS: Record<string, string[]> = {
  "raw bar": ["raw bar"],
  omakase: ["omakase"],
  "tasting menu": ["tasting menu", "chef's tasting", "chefs tasting"],
  "prix fixe": ["prix fixe", "pre fixe", "pre-fixe"],
  hookah: ["hookah", "shisha"],
};

export type MenuIntelligence = {
  version: string;
  sourceUrl: string;
  contentHash: string;
  signatureItems: string[];
  foodTerms: string[];
  dietaryTerms: string[];
  mealPeriods: string[];
  drinkTerms: string[];
  featureTerms: string[];
  cuisineTerms: string[];
  searchKeywords: string[];
  semanticTags: string[];
  intentTags: string[];
};

export type MenuDiscoveryResult = {
  status: "found" | "not_found" | "blocked" | "failed";
  menuUrl: string | null;
  source: string | null;
  confidence: number | null;
  note: string;
  intelligence: MenuIntelligence | null;
};

type Candidate = {
  url: string;
  source: string;
  confidence: number;
  score: number;
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value: string) {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: unknown, base?: URL) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!isPublicHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    if (base) return null;
    try {
      const url = new URL(`https://${value.trim()}`);
      if (!isPublicHost(url.hostname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
}

function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (host === "::1" || host === "0.0.0.0") return false;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return true;
  const parts = ipv4.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return false;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

function venueHost(value: URL) {
  return value.hostname.toLowerCase().replace(/^www\./, "");
}

function sameVenueHost(left: URL, right: URL) {
  return venueHost(left) === venueHost(right);
}

function trustedMenuHost(url: URL) {
  const host = venueHost(url);
  return TRUSTED_MENU_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function nonCrawlableHost(url: URL) {
  const host = venueHost(url);
  return NON_CRAWLABLE_HOSTS.some((candidate) => host === candidate || host.endsWith(`.${candidate}`));
}

function normalizedText(value: string) {
  return ` ${value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function matchedTerms(text: string, dictionary: Record<string, string[]>) {
  const haystack = normalizedText(text);
  const matches: string[] = [];
  for (const [canonical, aliases] of Object.entries(dictionary)) {
    if (aliases.some((alias) => haystack.includes(normalizedText(alias)))) matches.push(canonical);
  }
  return unique(matches);
}

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  return [];
}

function typeNames(value: unknown) {
  return stringValues(value).map((entry) => entry.toLowerCase());
}

function walkStructuredData(
  node: unknown,
  state: { menuUrls: string[]; menuItems: string[]; cuisines: string[] },
  base: URL,
) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) walkStructuredData(child, state, base);
    return;
  }
  const record = node as Record<string, unknown>;
  const types = typeNames(record["@type"]);
  const isMenu = types.some((type) => type === "menu");
  const isMenuItem = types.some((type) => type === "menuitem");
  const isFoodBusiness = types.some((type) => ["restaurant", "foodestablishment", "barorpub", "cafeorcoffeeshop"].includes(type));

  for (const key of ["hasMenu", "menu"]) {
    const value = record[key];
    if (typeof value === "string") {
      const url = normalizeUrl(value, base);
      if (url) state.menuUrls.push(url);
    } else if (value && typeof value === "object") {
      const objectValue = value as Record<string, unknown>;
      for (const candidate of [objectValue.url, objectValue["@id"]]) {
        if (typeof candidate !== "string") continue;
        const url = normalizeUrl(candidate, base);
        if (url) state.menuUrls.push(url);
      }
    }
  }

  if (isMenu) {
    for (const candidate of [record.url, record["@id"]]) {
      if (typeof candidate !== "string") continue;
      const url = normalizeUrl(candidate, base);
      if (url) state.menuUrls.push(url);
    }
  }

  if (isMenuItem && typeof record.name === "string") state.menuItems.push(stripTags(record.name));
  if (isFoodBusiness) state.cuisines.push(...stringValues(record.servesCuisine));

  for (const child of Object.values(record)) walkStructuredData(child, state, base);
}

export function extractStructuredMenuData(html: string, baseUrl: string) {
  const base = new URL(baseUrl);
  const state = { menuUrls: [] as string[], menuItems: [] as string[], cuisines: [] as string[] };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walkStructuredData(JSON.parse(decodeEntities(match[1])), state, base);
    } catch {
      // Ignore malformed site-provided structured data.
    }
  }
  return {
    menuUrls: uniqueUrls(state.menuUrls),
    menuItems: unique(state.menuItems).slice(0, 30),
    cuisines: unique(state.cuisines).slice(0, 10),
  };
}

function uniqueUrls(values: string[]) {
  return [...new Set(values.map((value) => normalizeUrl(value)).filter((value): value is string => Boolean(value)))];
}

export function extractMenuLinkCandidates(html: string, baseUrl: string): Candidate[] {
  const base = new URL(baseUrl);
  const candidates: Candidate[] = [];
  const structured = extractStructuredMenuData(html, base.toString());
  for (const url of structured.menuUrls) {
    candidates.push({ url, source: "website_jsonld", confidence: 0.99, score: 100 });
  }

  for (const match of html.matchAll(/<a\b([^>]*)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const url = normalizeUrl(decodeEntities(match[2]), base);
    if (!url) continue;
    const target = new URL(url);
    if (nonCrawlableHost(target)) continue;
    const anchorText = stripTags(match[4]).toLowerCase();
    const pathText = `${target.pathname} ${target.search}`.toLowerCase();
    let score = 0;
    if (/^(our\s+)?menus?$/.test(anchorText)) score += 60;
    else if (/\b(menu|menus)\b/.test(anchorText)) score += 45;
    if (/\b(brunch|breakfast|lunch|dinner|food|drinks|cocktails)\b/.test(anchorText)) score += 20;
    if (/(^|[-_/])(menu|menus)([-_/]|$)/.test(pathText)) score += 40;
    if (/\.(pdf)(?:$|\?)/.test(pathText)) score += 12;
    if (trustedMenuHost(target) && score >= 40) score += 8;
    if (!sameVenueHost(target, base) && !trustedMenuHost(target) && score < 60) continue;
    if (score < 40) continue;
    candidates.push({
      url,
      source: sameVenueHost(target, base) ? "website_link" : "website_linked_provider",
      confidence: score >= 80 ? 0.97 : score >= 60 ? 0.93 : 0.88,
      score,
    });
  }

  return [...new Map(candidates.sort((a, b) => b.score - a.score).map((candidate) => [candidate.url, candidate])).values()];
}

function visibleText(html: string) {
  return stripTags(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " "),
  );
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deriveMenuIntelligence(html: string, sourceUrl: string): Promise<MenuIntelligence> {
  const structured = extractStructuredMenuData(html, sourceUrl);
  const text = visibleText(html).slice(0, MAX_HTML_BYTES);
  const foodTerms = matchedTerms(text, FOOD_TERMS);
  const dietaryTerms = matchedTerms(text, DIETARY_TERMS);
  const mealPeriods = matchedTerms(text, MEAL_TERMS);
  const drinkTerms = matchedTerms(text, DRINK_TERMS);
  const featureTerms = matchedTerms(text, FEATURE_TERMS);
  const cuisineTerms = structured.cuisines;
  const signatureItems = unique([...structured.menuItems, ...foodTerms]).slice(0, 30);
  const searchKeywords = unique([
    ...foodTerms,
    ...dietaryTerms,
    ...mealPeriods,
    ...drinkTerms,
    ...featureTerms,
    ...cuisineTerms,
  ]);
  const semanticTags = unique(searchKeywords);
  const intentTags = unique([...dietaryTerms, ...mealPeriods, ...drinkTerms, ...featureTerms]);
  return {
    version: MENU_INTELLIGENCE_VERSION,
    sourceUrl,
    contentHash: await sha256(`${visibleText(html)}\n${structured.menuItems.join("|")}\n${structured.cuisines.join("|")}`),
    signatureItems,
    foodTerms,
    dietaryTerms,
    mealPeriods,
    drinkTerms,
    featureTerms,
    cuisineTerms,
    searchKeywords,
    semanticTags,
    intentTags,
  };
}

async function fetchSameVenuePage(start: URL, home: URL) {
  let current = start;
  for (let redirects = 0; redirects <= MAX_SAME_VENUE_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)", Accept: "text/html,application/pdf;q=0.9" },
      });
      if (response.status < 300 || response.status >= 400) return response;
      const location = response.headers.get("location");
      if (!location) return response;
      const nextValue = normalizeUrl(location, current);
      if (!nextValue) return response;
      const next = new URL(nextValue);
      if (!sameVenueHost(next, home)) return response;
      current = next;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

async function fetchMenuTarget(url: URL, home: URL) {
  if (sameVenueHost(url, home)) return fetchSameVenuePage(url, home);
  if (!trustedMenuHost(url)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "TheOutHavenBot/1.0 (+https://theouthaven.com)", Accept: "text/html,application/pdf;q=0.9" },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readHtml(response: Response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("Menu page exceeds maximum crawl size");
  const value = await response.text();
  return value.slice(0, MAX_HTML_BYTES);
}

function classifyFoundTarget(url: URL, response: Response) {
  const type = (response.headers.get("content-type") || "").toLowerCase();
  const path = url.pathname.toLowerCase();
  if (type.includes("application/pdf") || path.endsWith(".pdf")) return "pdf";
  if (type.includes("text/html") || !type) return "html";
  return null;
}

export async function discoverMenu(
  website: string,
  options: { knownMenuUrl?: string | null; analyzeContent?: boolean } = {},
): Promise<MenuDiscoveryResult> {
  const normalized = normalizeUrl(website);
  if (!normalized) return { status: "failed", menuUrl: null, source: null, confidence: null, note: "Invalid website URL", intelligence: null };
  const home = new URL(normalized);
  if (nonCrawlableHost(home)) {
    return { status: "not_found", menuUrl: null, source: null, confidence: null, note: `Skipped non-crawlable website host: ${venueHost(home)}`, intelligence: null };
  }

  let blocked = 0;
  let failed = 0;
  const notes: string[] = [];

  const validate = async (candidate: Candidate): Promise<MenuDiscoveryResult | null> => {
    const urlValue = normalizeUrl(candidate.url, home);
    if (!urlValue) return null;
    const url = new URL(urlValue);
    try {
      const response = await fetchMenuTarget(url, home);
      if (!response) return null;
      if (response.status === 403 || response.status === 429) { blocked += 1; notes.push(`${url.pathname}:${response.status}`); return null; }
      if (response.status >= 500) { failed += 1; notes.push(`${url.pathname}:${response.status}`); return null; }
      if (!response.ok) return null;
      const kind = classifyFoundTarget(url, response);
      if (!kind) return null;
      let intelligence: MenuIntelligence | null = null;
      if (options.analyzeContent && kind === "html" && sameVenueHost(url, home)) {
        intelligence = await deriveMenuIntelligence(await readHtml(response), url.toString());
      }
      return {
        status: "found",
        menuUrl: url.toString(),
        source: candidate.source,
        confidence: candidate.confidence,
        note: `Validated ${kind} menu from ${candidate.source}`,
        intelligence,
      };
    } catch (error) {
      failed += 1;
      notes.push(error instanceof Error ? error.message : "Menu validation failed");
      return null;
    }
  };

  const known = normalizeUrl(options.knownMenuUrl || "", home);
  if (known) {
    const found = await validate({ url: known, source: "existing_menu_url", confidence: 1, score: 120 });
    if (found) return found;
  }

  let homepageHtml = "";
  try {
    const response = await fetchSameVenuePage(home, home);
    if (response?.status === 403 || response?.status === 429) blocked += 1;
    else if (response && response.status >= 500) failed += 1;
    else if (response?.ok && (response.headers.get("content-type") || "").includes("text/html")) homepageHtml = await readHtml(response);
  } catch (error) {
    failed += 1;
    notes.push(error instanceof Error ? error.message : "Homepage menu discovery failed");
  }

  if (homepageHtml) {
    const candidates = extractMenuLinkCandidates(homepageHtml, home.toString()).slice(0, 6);
    for (const candidate of candidates) {
      const found = await validate(candidate);
      if (found) return found;
    }
  }

  for (const path of MENU_DISCOVERY_PATHS) {
    const candidateUrl = new URL(path, home.origin);
    const found = await validate({ url: candidateUrl.toString(), source: "website_common_path", confidence: 0.82, score: 30 });
    if (found) return found;
  }

  if (homepageHtml) {
    const structured = extractStructuredMenuData(homepageHtml, home.toString());
    if (options.analyzeContent && (structured.menuItems.length || structured.cuisines.length)) {
      const intelligence = await deriveMenuIntelligence(homepageHtml, home.toString());
      return {
        status: "found",
        menuUrl: home.toString(),
        source: "website_embedded_menu",
        confidence: 0.86,
        note: "Found structured menu content embedded on the official website",
        intelligence,
      };
    }
  }

  if (blocked > 0 && failed === 0) {
    return { status: "blocked", menuUrl: null, source: null, confidence: null, note: `Menu discovery blocked on ${blocked} request(s): ${notes.slice(0, 3).join(", ")}`, intelligence: null };
  }
  if (failed > 0 && !homepageHtml) {
    return { status: "failed", menuUrl: null, source: null, confidence: null, note: `Menu discovery failed on ${failed} request(s): ${notes.slice(0, 3).join(", ")}`, intelligence: null };
  }
  return { status: "not_found", menuUrl: null, source: null, confidence: null, note: "Official website checked; no validated menu link found", intelligence: null };
}
