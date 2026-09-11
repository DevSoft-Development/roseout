import "server-only";

import type { WebsiteMigrationManifest } from "@/lib/websites/import-crawler";
import type { MigrationContentInventory } from "@/lib/websites/import-content-inventory";

export type WebsiteMigrationException = {
  key: string;
  code: string;
  severity: "info" | "warning" | "blocking";
  title: string;
  detail: string;
  page_url?: string;
};

function host(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function issue(code: string, severity: WebsiteMigrationException["severity"], title: string, detail: string, pageUrl?: string): WebsiteMigrationException {
  return {
    key: pageUrl ? `${code}:${pageUrl}` : code,
    code,
    severity,
    title,
    detail,
    ...(pageUrl ? { page_url: pageUrl } : {}),
  };
}

export function buildMigrationExceptions(
  manifest: WebsiteMigrationManifest,
  inventory: MigrationContentInventory,
  reservationProvider: string | null,
): WebsiteMigrationException[] {
  const issues: WebsiteMigrationException[] = [];
  const sourceHost = host(manifest.source_url);

  if (!manifest.page_count) {
    issues.push(issue("no_pages", "blocking", "No pages could be imported", "The source website did not return usable HTML pages."));
  }
  if (!manifest.asset_count) {
    issues.push(issue("missing_images", "warning", "No reusable website images found", "Add business-owned photos before publishing so the migrated site does not feel incomplete."));
  }
  if (manifest.form_count > 0) {
    issues.push(issue("forms_need_review", "warning", "Forms need review", `${manifest.form_count} existing form${manifest.form_count === 1 ? "" : "s"} were detected. Forms are not copied blindly; recreate the required lead/contact behavior with TheOutHaven-supported forms.`));
  }
  if (inventory.downloadable_menus.length > 0 && inventory.menu_pages.length === 0) {
    issues.push(issue("menu_pdf_only", "warning", "Menu appears to be PDF-only", "A downloadable menu was found without a structured menu page. Keep the PDF available and add structured menu content when possible."));
  }
  if (manifest.reservation_links.length > 0 && (!reservationProvider || reservationProvider === "External")) {
    issues.push(issue("reservation_provider_unknown", "warning", "Reservation provider needs confirmation", "A booking link was found, but the provider could not be confidently identified. Confirm it before cutover."));
  }

  const homepageCanonical = manifest.crawled_pages[0]?.canonical;
  if (homepageCanonical && host(homepageCanonical) && host(homepageCanonical) !== sourceHost) {
    const pageUrl = manifest.crawled_pages[0]?.url;
    issues.push(issue("canonical_host_mismatch", "warning", "Canonical URL points to another domain", "The current website advertises a canonical URL on a different domain. Review SEO ownership before cutover.", pageUrl));
  }

  for (const page of manifest.crawled_pages) {
    const uncategorized = page.path !== "/" && manifest.redirect_map.find((item) => item.from === page.path)?.to === "/";
    if (uncategorized) {
      issues.push(issue("redirect_needs_review", "info", "Old page maps to the homepage", `Review the redirect for ${page.path}; a more specific destination may preserve SEO value better.`, page.url));
    }
  }

  const externalAssets = manifest.crawled_pages.flatMap((page) => page.assets).filter((url) => {
    const assetHost = host(url);
    return assetHost && sourceHost && assetHost !== sourceHost && !assetHost.endsWith(`.${sourceHost}`);
  });
  if (externalAssets.length > 0) {
    issues.push(issue("external_assets", "info", "Externally hosted assets detected", `${externalAssets.length} asset reference${externalAssets.length === 1 ? "" : "s"} are hosted outside the source domain. Copy business-owned/licensed assets into TheOutHaven hosting before relying on them long-term.`));
  }

  return issues.slice(0, 40);
}
