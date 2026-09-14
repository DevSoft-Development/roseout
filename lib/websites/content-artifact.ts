import "server-only";

import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteArtifactFile } from "@/lib/websites/publish-contract";
import { renderBespokePremiumWebsiteArtifact } from "@/lib/websites/bespoke-premium-renderer";
import { routeGeneratedReservationArtifact } from "@/lib/websites/reservation-routing-artifact";
import { addGeneratedWebsitePages } from "@/lib/websites/multi-page-artifact";
import { enhanceWebsiteSeoAccessibility } from "@/lib/websites/seo-accessibility-artifact";
import { addMigrationRedirectArtifacts } from "@/lib/websites/migration-redirect-artifact";

/**
 * Premium hosted websites now render from bespoke structural archetypes rather than
 * starting with the legacy shared shell and skinning it with CSS. Downstream routing,
 * multi-page generation, migration redirects, and SEO/accessibility enhancement stay
 * unchanged so this is a presentation-layer upgrade, not a hosting/data rewrite.
 */
export function renderEnhancedWebsiteArtifact(
  website: BusinessWebsite,
  location: GeneratedWebsiteLocationSnapshot,
): WebsiteArtifactFile[] {
  const rendered = renderBespokePremiumWebsiteArtifact(website, location);
  const routed = routeGeneratedReservationArtifact(rendered, location);
  const paged = addGeneratedWebsitePages(routed);
  const redirected = addMigrationRedirectArtifacts(paged, website);
  return enhanceWebsiteSeoAccessibility(redirected, website, location);
}
