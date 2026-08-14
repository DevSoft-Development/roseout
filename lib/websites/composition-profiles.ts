export type WebsiteCompositionId =
  | "editorial_luxury"
  | "refined_after_dark"
  | "modern_minimal"
  | "bold_social"
  | "classic_bistro"
  | "coastal_airy"
  | "warm_neighborhood"
  | "luxury_minimal"
  | "experiential_escape"
  | "creative_workshop";

export type WebsiteCompositionProfile = {
  id: WebsiteCompositionId;
  nav: "transparent" | "solid" | "bordered";
  hero: "split" | "editorial" | "reservation" | "offset" | "centered" | "framed" | "story" | "minimal" | "experience" | "playful";
  sectionOrder: Array<"hero" | "reservations" | "about" | "gallery" | "hours" | "contact">;
  reservationPlacement: "hero-adjacent" | "after-hero" | "mid-page";
  radius: string;
  maxWidth: string;
  displayScale: string;
  eyebrowTracking: string;
  imageRatio: string;
  sectionRule: "none" | "line" | "soft";
};

export const WEBSITE_COMPOSITION_PROFILES: Record<WebsiteCompositionId, WebsiteCompositionProfile> = {
  editorial_luxury: { id: "editorial_luxury", nav: "bordered", hero: "editorial", sectionOrder: ["hero", "reservations", "about", "gallery", "hours", "contact"], reservationPlacement: "after-hero", radius: "4px", maxWidth: "1240px", displayScale: "clamp(3.8rem,8vw,7.6rem)", eyebrowTracking: ".22em", imageRatio: "4/5", sectionRule: "line" },
  refined_after_dark: { id: "refined_after_dark", nav: "transparent", hero: "offset", sectionOrder: ["hero", "reservations", "about", "gallery", "hours", "contact"], reservationPlacement: "hero-adjacent", radius: "2px", maxWidth: "1280px", displayScale: "clamp(4rem,8.5vw,8rem)", eyebrowTracking: ".26em", imageRatio: "3/4", sectionRule: "soft" },
  modern_minimal: { id: "modern_minimal", nav: "solid", hero: "reservation", sectionOrder: ["hero", "reservations", "about", "hours", "gallery", "contact"], reservationPlacement: "hero-adjacent", radius: "18px", maxWidth: "1180px", displayScale: "clamp(3.2rem,6vw,6.2rem)", eyebrowTracking: ".14em", imageRatio: "16/10", sectionRule: "none" },
  bold_social: { id: "bold_social", nav: "transparent", hero: "experience", sectionOrder: ["hero", "gallery", "reservations", "about", "hours", "contact"], reservationPlacement: "mid-page", radius: "28px", maxWidth: "1320px", displayScale: "clamp(4rem,9vw,8.5rem)", eyebrowTracking: ".12em", imageRatio: "16/11", sectionRule: "none" },
  classic_bistro: { id: "classic_bistro", nav: "bordered", hero: "story", sectionOrder: ["hero", "about", "reservations", "hours", "gallery", "contact"], reservationPlacement: "mid-page", radius: "0px", maxWidth: "1160px", displayScale: "clamp(3.4rem,6.5vw,6.6rem)", eyebrowTracking: ".2em", imageRatio: "5/6", sectionRule: "line" },
  coastal_airy: { id: "coastal_airy", nav: "solid", hero: "framed", sectionOrder: ["hero", "reservations", "about", "gallery", "contact", "hours"], reservationPlacement: "after-hero", radius: "26px", maxWidth: "1260px", displayScale: "clamp(3.5rem,7vw,6.8rem)", eyebrowTracking: ".18em", imageRatio: "4/3", sectionRule: "none" },
  warm_neighborhood: { id: "warm_neighborhood", nav: "solid", hero: "split", sectionOrder: ["hero", "reservations", "about", "hours", "contact", "gallery"], reservationPlacement: "after-hero", radius: "22px", maxWidth: "1120px", displayScale: "clamp(3.2rem,6vw,5.8rem)", eyebrowTracking: ".13em", imageRatio: "4/3", sectionRule: "soft" },
  luxury_minimal: { id: "luxury_minimal", nav: "transparent", hero: "minimal", sectionOrder: ["hero", "reservations", "about", "hours", "contact", "gallery"], reservationPlacement: "after-hero", radius: "0px", maxWidth: "1080px", displayScale: "clamp(4.2rem,9vw,8.2rem)", eyebrowTracking: ".28em", imageRatio: "3/2", sectionRule: "line" },
  experiential_escape: { id: "experiential_escape", nav: "solid", hero: "experience", sectionOrder: ["hero", "reservations", "gallery", "about", "hours", "contact"], reservationPlacement: "hero-adjacent", radius: "24px", maxWidth: "1320px", displayScale: "clamp(3.8rem,7.5vw,7.2rem)", eyebrowTracking: ".12em", imageRatio: "16/10", sectionRule: "none" },
  creative_workshop: { id: "creative_workshop", nav: "solid", hero: "playful", sectionOrder: ["hero", "reservations", "gallery", "about", "hours", "contact"], reservationPlacement: "after-hero", radius: "30px", maxWidth: "1200px", displayScale: "clamp(3.4rem,7vw,6.4rem)", eyebrowTracking: ".1em", imageRatio: "4/3", sectionRule: "none" },
};

export function getWebsiteCompositionProfile(id: string | null | undefined) {
  const normalized = String(id || "modern_minimal") as WebsiteCompositionId;
  return WEBSITE_COMPOSITION_PROFILES[normalized] || WEBSITE_COMPOSITION_PROFILES.modern_minimal;
}
