import "server-only";
import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteV3ConceptId } from "@/lib/websites/v3/catalog";
import { renderNocturneV3Preview } from "@/lib/websites/v3/nocturne";
import { renderAtelierV3Preview } from "@/lib/websites/v3/atelier";
import { renderVistaV3Preview } from "@/lib/websites/v3/vista";
import { renderSocialHouseV3Preview } from "@/lib/websites/v3/social-house";
import { renderQuietLuxuryV3Preview } from "@/lib/websites/v3/quiet-luxury";

export function renderWebsiteV3Preview(concept:WebsiteV3ConceptId,website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot){
  switch(concept){
    case "atelier": return renderAtelierV3Preview(website,location);
    case "vista": return renderVistaV3Preview(website,location);
    case "social_house": return renderSocialHouseV3Preview(website,location);
    case "quiet_luxury": return renderQuietLuxuryV3Preview(website,location);
    case "nocturne":
    default: return renderNocturneV3Preview(website,location);
  }
}
