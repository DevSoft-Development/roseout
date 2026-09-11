import "server-only";

import type { WebsiteMigrationManifest } from "@/lib/websites/import-crawler";
import type { MigrationContentInventory } from "@/lib/websites/import-content-inventory";

export type WebsiteMigrationException = {
  code: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  detail: string;
  page_url?: string;
};

function host(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

export function buildMigrationExceptions(
  manifest: WebsiteMigrationManifest,
  inventory: MigrationContentInventory,
  reservationProvider: string | null,
): WebsiteMigrationException[] {
  const issues: WebsiteMigrationException[] = [];
  const sourceHost = host(manifest.source_url);

  if (!manifest.page_count) {
    issues.push({ code: "no_pages", severity: "blocking", title: "No pages could be imported", detail: "The source website did not return usable HTML pages." });
  }
  if (!manifest.asset_count) {
    issues.push({ code: "missing_images", severity: "warning", title: "No reusable website images found", detail: "Add business-owned photos before publishing so the migrated site does not feel incomplete." });
  }
  if (manifest.form_count > 0) {
    issues.push({ code: "forms_need_review", severity: "warning", title: "Forms need review", detail: `${manifest.form_count} existing form${manifest.form_count === 1 ? "" : "s"} were detected. Forms are not copied blindly; recreate the required lead/contact behavior with TheOutHaven-supported forms.` });
  }
  if (inventory.downloadable_menus.length > 0 && inventory.menu_pages.length === 0) {
    issues.push({ code: "menu_pdf_only", severity: "warning", title: "Menu appears to be PDF-only", detail: "A downloadable menu was found without a structured menu page. Keep the PDF available and add structured menu content when possible." });
  }
  if (manifest.reservation_links.length > 0 && (!reservationProvider || reservationProvider === "External")) {
    issues.push({ code: "reservation_provider_unknown", severity: "warning", title: "Reservation provider needs confirmation", detail: "A booking link was found, but the provider could not be confidently identified. Confirm it before cutover." });
  }

  const homepageCanonical = manifest.crawled_pages[0]?.canonical;
  if (homepageCanonical && host(homepageCanonical) && host(homepageCanonical) !== sourceHost) {
    issues.push({ code: "canonical_host_mismatch", severity: "warning", title: "Canonical URL points to another domain", detail: "The current website advertises a canonical URL on a different domain. Review SEO ownership before cutover.", page_url: manifest.crawled_pages[0]?.url });
  }

  for (const page of manifest.crawled_pages) {
    const uncategorized = page.path !== "/" && manifest.redirect_map.find((item) => item.from === page.path)?.to === "/";
    if (uncategorized) {
      issues.push({ code: "redirect_needs_review", severity: "info", title: "Old page maps to the homepage", detail: `Review the redirect for ${page.path}; a more specific destination may preserve SEO value better.`, page_url: page.url });
    }
  }

  const externalAssets = manifest.crawled_pages.flatMap((page) => page.assets).filter((url) => {
    const assetHost = host(url);
    return assetHost && sourceHost && assetHost !== sourceHost && !assetHost.endsWith(`.${sourceHost}`);
  });
  if (externalAssets.length > 0) {
    issues.push({ code: "external_assets", severity: "info", title: "Externally hosted assets detected", detail: `${externalAssets.length} asset reference${externalAssets.length === 1 ? "" : "s"} are hosted outside the source domain. Copy business-owned/licensed assets into TheOutHaven hosting before relying on them long-term.` });
  }

  return issues.slice(0, 40);
}
