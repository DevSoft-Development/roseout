import "server-only";
import type { BusinessWebsite } from "@/lib/websites/data";
import type { GeneratedWebsiteLocationSnapshot } from "@/lib/websites/location-content";
import type { WebsiteV3ConceptId } from "@/lib/websites/v3/catalog";
import { buildV3PreviewArtifact, type V3PageProfile, type WebsiteV3PreviewArtifact } from "@/lib/websites/v3/artifact";
import { enhanceV3HomeHtml } from "@/lib/websites/v3/home-conversion";
import { renderNocturneV3Preview } from "@/lib/websites/v3/nocturne";
import { renderAtelierV3Preview } from "@/lib/websites/v3/atelier";
import { renderVistaV3Preview } from "@/lib/websites/v3/vista";
import { renderSocialHouseV3Preview } from "@/lib/websites/v3/social-house";
import { renderQuietLuxuryV3Preview } from "@/lib/websites/v3/quiet-luxury";
import { renderMaisonV3Preview } from "@/lib/websites/v3/maison";
import { renderPulseV3Preview } from "@/lib/websites/v3/pulse";
import { renderBotanicaV3Preview } from "@/lib/websites/v3/botanica";
import { renderGrandstandV3Preview } from "@/lib/websites/v3/grandstand";
import { renderGalleryHouseV3Preview } from "@/lib/websites/v3/gallery-house";
import { renderRivieraV3Preview } from "@/lib/websites/v3/riviera";
import { renderEmberV3Preview } from "@/lib/websites/v3/ember";
import { renderVelvetRoomV3Preview } from "@/lib/websites/v3/velvet-room";
import { renderMarketHallV3Preview } from "@/lib/websites/v3/market-hall";
import { renderSkylineV3Preview } from "@/lib/websites/v3/skyline";

const PROFILES:Record<WebsiteV3ConceptId,V3PageProfile>={
  nocturne:{background:"#090807",foreground:"#f4eee5",muted:"#ad9f92",accent:"#cbaa73",panel:"#14110f",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"line"},
  atelier:{background:"#f1eee8",foreground:"#171717",muted:"#666",accent:"#171717",panel:"#e8e3db",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"minimal"},
  vista:{background:"#e9eee8",foreground:"#153027",muted:"#557066",accent:"#17372d",panel:"#dce5dc",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"line"},
  social_house:{background:"#fff4ef",foreground:"#281b2e",muted:"#745f78",accent:"#ff4e7a",panel:"#ffe2d8",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"22px",navStyle:"floating"},
  quiet_luxury:{background:"#f5f1ea",foreground:"#2d2a25",muted:"#7a746c",accent:"#8c765e",panel:"#ebe4da",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"2px",navStyle:"minimal"},
  maison:{background:"#f3eadb",foreground:"#3b241b",muted:"#775f52",accent:"#8d4d36",panel:"#eadac7",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"line"},
  pulse:{background:"#08070c",foreground:"#ffffff",muted:"#a69daa",accent:"#ff4fd8",panel:"#14101b",serif:'Arial,sans-serif',sans:'Arial,sans-serif',radius:"18px",navStyle:"floating"},
  botanica:{background:"#eef1df",foreground:"#25422f",muted:"#667766",accent:"#567b56",panel:"#dfe7c9",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"28px",navStyle:"floating"},
  grandstand:{background:"#f4f1e7",foreground:"#111111",muted:"#5a574f",accent:"#111111",panel:"#ffdd33",serif:'Arial,sans-serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"boxed"},
  gallery_house:{background:"#ffffff",foreground:"#101010",muted:"#707070",accent:"#101010",panel:"#f1f1f1",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"minimal"},
  riviera:{background:"#f7f2e7",foreground:"#173a46",muted:"#647a80",accent:"#b87855",panel:"#e8dfcf",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"line"},
  ember:{background:"#120b08",foreground:"#f4e4d2",muted:"#bca997",accent:"#d77a45",panel:"#21120c",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"boxed"},
  velvet_room:{background:"#140f17",foreground:"#f2e7ef",muted:"#bba8b8",accent:"#a87aa2",panel:"#241b27",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"14px",navStyle:"minimal"},
  market_hall:{background:"#fff9ed",foreground:"#1f2b21",muted:"#687168",accent:"#d96b3b",panel:"#f3e7cf",serif:'Arial,sans-serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"boxed"},
  skyline:{background:"#0b1018",foreground:"#eef4ff",muted:"#9caac0",accent:"#7fb4ff",panel:"#141d2a",serif:'Georgia,serif',sans:'Arial,sans-serif',radius:"0px",navStyle:"floating"},
};

function rawHome(concept:WebsiteV3ConceptId,website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot){
 switch(concept){
  case "atelier": return renderAtelierV3Preview(website,location);
  case "vista": return renderVistaV3Preview(website,location);
  case "social_house": return renderSocialHouseV3Preview(website,location);
  case "quiet_luxury": return renderQuietLuxuryV3Preview(website,location);
  case "maison": return renderMaisonV3Preview(website,location);
  case "pulse": return renderPulseV3Preview(website,location);
  case "botanica": return renderBotanicaV3Preview(website,location);
  case "grandstand": return renderGrandstandV3Preview(website,location);
  case "gallery_house": return renderGalleryHouseV3Preview(website,location);
  case "riviera": return renderRivieraV3Preview(website,location);
  case "ember": return renderEmberV3Preview(website,location);
  case "velvet_room": return renderVelvetRoomV3Preview(website,location);
  case "market_hall": return renderMarketHallV3Preview(website,location);
  case "skyline": return renderSkylineV3Preview(website,location);
  case "nocturne":
  default: return renderNocturneV3Preview(website,location);
 }
}

function home(concept:WebsiteV3ConceptId,website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot){
  return enhanceV3HomeHtml(concept,rawHome(concept,website,location),location);
}

const LABELS:Record<WebsiteV3ConceptId,string>={nocturne:"Nocturne",atelier:"Atelier",vista:"Vista",social_house:"Social House",quiet_luxury:"Quiet Luxury",maison:"Maison",pulse:"Pulse",botanica:"Botanica",grandstand:"Grandstand",gallery_house:"Gallery House",riviera:"Riviera",ember:"Ember",velvet_room:"Velvet Room",market_hall:"Market Hall",skyline:"Skyline"};

export function renderWebsiteV3Preview(concept:WebsiteV3ConceptId,website:BusinessWebsite,location:GeneratedWebsiteLocationSnapshot):WebsiteV3PreviewArtifact{
 return buildV3PreviewArtifact({homeHtml:home(concept,website,location),website,location,profile:PROFILES[concept],conceptName:LABELS[concept]});
}
