import type { WebsiteMigrationManifest } from "@/lib/websites/import-crawler";

export type MigrationContentInventory = {
  menu_pages: string[];
  event_pages: string[];
  reservation_pages: string[];
  about_pages: string[];
  private_event_pages: string[];
  faq_pages: string[];
  contact_pages: string[];
  downloadable_menus: string[];
  provider_extraction: string[];
};

function paths(manifest: WebsiteMigrationManifest, pattern: RegExp) {
  return manifest.crawled_pages
    .filter((page) => pattern.test(`${page.path} ${page.title || ""} ${page.headings.join(" ")}`))
    .map((page) => page.url);
}

export function buildMigrationContentInventory(manifest: WebsiteMigrationManifest, adapterId: string): MigrationContentInventory {
  const downloads = manifest.downloads.filter((url) => /(menu|food|drink|brunch|dinner|lunch|cocktail)/i.test(url));
  const providerExtraction: string[] = [];
  if (adapterId === "wordpress") providerExtraction.push("WordPress page hierarchy", "WordPress media/content signals");
  if (adapterId === "wix") providerExtraction.push("Wix page hierarchy", "Wix media signals");
  if (adapterId === "squarespace") providerExtraction.push("Squarespace collections", "Squarespace image/content signals");
  if (adapterId === "toast") providerExtraction.push("Toast menu/order signals", "Toast reservation links");
  if (adapterId === "bentobox") providerExtraction.push("BentoBox menu/event signals", "BentoBox hospitality navigation");
  if (adapterId === "popmenu") providerExtraction.push("Popmenu menu/event signals", "Popmenu conversion links");
  if (adapterId === "webflow") providerExtraction.push("Webflow CMS/navigation signals");
  if (adapterId === "shopify") providerExtraction.push("Shopify page/product navigation signals");

  return {
    menu_pages: paths(manifest, /menu|food|drink|brunch|dinner|lunch/i),
    event_pages: paths(manifest, /event|calendar|happenings|live music|show/i),
    reservation_pages: paths(manifest, /reserv|book|table/i),
    about_pages: paths(manifest, /about|story|team|chef/i),
    private_event_pages: paths(manifest, /private|party|parties|group|corporate|catering/i),
    faq_pages: paths(manifest, /faq|frequently|questions/i),
    contact_pages: paths(manifest, /contact|visit|location|directions|hours/i),
    downloadable_menus: downloads,
    provider_extraction: providerExtraction,
  };
}
