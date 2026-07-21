export type GrowthChildTab = "growth-overview" | "offers" | "vip-list" | "event-leads" | "marketing-studio" | "campaigns" | "conversion" | "growth-settings";

export const GROWTH_CHILD_TABS: { id: GrowthChildTab; label: string }[] = [
  { id: "growth-overview", label: "Overview" },
  { id: "offers", label: "Offers" },
  { id: "vip-list", label: "VIP Audience" },
  { id: "event-leads", label: "Event Leads" },
  { id: "marketing-studio", label: "Marketing Studio" },
  { id: "campaigns", label: "Campaigns" },
  { id: "conversion", label: "Conversion" },
  { id: "growth-settings", label: "Growth Settings" },
];

export function normalizeGrowthChildTab(tab?: string | null): GrowthChildTab {
  const normalized = String(tab || "growth-overview").trim().toLowerCase();
  const aliases: Record<string, GrowthChildTab> = { vip: "vip-list", leads: "event-leads", marketing: "marketing-studio", "growth": "growth-overview", "growth-overview": "growth-overview" };
  const candidate = aliases[normalized] || normalized;
  return GROWTH_CHILD_TABS.some((item) => item.id === candidate) ? candidate as GrowthChildTab : "growth-overview";
}

export function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => { const key = getKey(item).trim().toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}

export function isActiveOffer(offer: any, now = new Date()): boolean {
  const status = String(offer?.status || "").toLowerCase();
  const end = offer?.end_date || offer?.ends_at || offer?.expires_at;
  return ["active", "published", "live"].includes(status) && (!end || new Date(end) >= now);
}

export function calculateConversionRate(numerator: number, denominator: number): number { return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0; }

export function calculateGrowthReadinessScore(input: { location: any; offers: any[]; vipCount: number; leads: any[]; qrCodes: any[]; generations: any[]; reservations: number; analyticsAvailable: boolean }) {
  const l = input.location || {};
  const images = [l.main_image, l.image_url, ...(Array.isArray(l.images) ? l.images : []), ...(Array.isArray(l.gallery_images) ? l.gallery_images : []), ...(Array.isArray(l.photos) ? l.photos : [])].filter(Boolean);
  const categories = [
    { key: "listing_quality", label: "Listing quality", score: [l.name,l.description,l.category,l.address,l.city].filter(Boolean).length * 20, complete: Boolean(l.name && l.description && l.category && (l.address || l.city)), missing: "Complete name, description, category, and address." },
    { key: "search_visibility", label: "Search visibility", score: l.is_searchable ? 100 : 25, complete: Boolean(l.is_searchable), missing: "Enable public search visibility." },
    { key: "photos", label: "Photos", score: Math.min(100, images.length * 25), complete: images.length >= 4, missing: "Add at least four listing photos." },
    { key: "menu_packages", label: "Menu or package readiness", score: (l.menu_url || l.has_menu || l.has_packages) ? 100 : 35, complete: Boolean(l.menu_url || l.has_menu || l.has_packages), missing: "Add menu items or event packages." },
    { key: "offers", label: "Offers", score: input.offers.some((o) => isActiveOffer(o)) ? 100 : input.offers.length ? 65 : 0, complete: input.offers.some((o) => isActiveOffer(o)), missing: "Create or activate an offer." },
    { key: "vip_capture", label: "VIP capture", score: input.vipCount > 0 || l.vip_signup_url ? 100 : 30, complete: Boolean(input.vipCount > 0 || l.vip_signup_url), missing: "Publish a VIP signup page or import consented contacts." },
    { key: "event_leads", label: "Event lead capture", score: input.leads.length > 0 || l.event_lead_url ? 100 : 40, complete: Boolean(input.leads.length > 0 || l.event_lead_url), missing: "Configure event packages and lead capture." },
    { key: "qr_setup", label: "QR setup", score: input.qrCodes.length ? 100 : 20, complete: input.qrCodes.length > 0, missing: "Generate a menu, offer, or VIP QR code." },
    { key: "marketing_content", label: "Marketing content", score: input.generations.length ? 100 : 25, complete: input.generations.length > 0, missing: "Generate editable marketing content." },
    { key: "reservation_conversion", label: "Reservation conversion setup", score: (l.reservation_url || l.external_reservation_url || input.reservations > 0) ? 100 : 35, complete: Boolean(l.reservation_url || l.external_reservation_url), missing: "Add a reservation call to action." },
    { key: "contact_information", label: "Contact information", score: [l.phone,l.website,l.owner_email].filter(Boolean).length >= 2 ? 100 : 35, complete: Boolean(l.phone && (l.website || l.owner_email)), missing: "Add phone plus website or owner email." },
    { key: "analytics", label: "Analytics availability", score: input.analyticsAvailable ? 100 : 30, complete: input.analyticsAvailable, missing: "Enable listing, QR, reservation, or campaign tracking." },
  ];
  const score = Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);
  const missingItems = categories.filter((c) => !c.complete).map((c) => c.missing);
  return { score, categories, completedItems: categories.filter((c) => c.complete).map((c) => c.label), missingItems, nextAction: missingItems[0] || "Monitor performance and optimize campaigns." };
}

export function buildGrowthRecommendations(input: { location: any; readiness: ReturnType<typeof calculateGrowthReadinessScore>; offers: any[]; vipCount: number; leads: any[]; qrCodes: any[]; generations: any[]; campaigns: any[]; planStatus: string; baseHref: string }) {
  const items = [] as any[]; const add = (x:any)=>items.push(x);
  if (input.planStatus !== "active") add({ key:"upgrade", priority:"High", impact:"Unlocks Growth Pro actions", reason:"Current plan does not include all Growth workspace write actions.", requiredPlan:"Growth Pro", effort:"5 minutes", href:`${input.baseHref}plan`, complete:false });
  if (!input.offers.some((offer) => isActiveOffer(offer))) add({ key:"offer", priority:"High", impact:"Creates a measurable guest acquisition incentive", reason:"No currently active offer is available.", requiredPlan:"Growth Pro", effort:"15 minutes", href:`${input.baseHref}offers`, complete:false });
  if (!(input.location?.vip_signup_url || input.vipCount > 0)) add({ key:"vip", priority:"High", impact:"Builds a consented owned audience", reason:"VIP capture is not configured or has no contacts.", requiredPlan:"Growth Pro", effort:"10 minutes", href:`${input.baseHref}vip-list`, complete:false });
  if (!input.qrCodes.length) add({ key:"qr", priority:"Medium", impact:"Connects in-venue traffic to trackable actions", reason:"No location-scoped QR codes were found.", requiredPlan:"Growth Pro", effort:"5 minutes", href:`${input.baseHref}qr-codes`, complete:false });
  if (!input.generations.length) add({ key:"marketing", priority:"Medium", impact:"Speeds up demand-generation content", reason:"No recent marketing generations exist.", requiredPlan:"Growth Pro", effort:"10 minutes", href:`${input.baseHref}marketing-studio`, complete:false });
  if (!input.location?.reservation_url && !input.location?.external_reservation_url) add({ key:"reservation", priority:"Medium", impact:"Improves conversion from listing traffic", reason:"Reservation call to action is missing.", requiredPlan:"Included", effort:"10 minutes", href:`${input.baseHref}growth-settings`, complete:false });
  return dedupeByKey(items, (i) => i.key);
}
