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

/**
 * These profiles intentionally change composition, rhythm and image proportion — not
 * just palette. They are consumed by the existing static website renderer and remain
 * backwards-compatible with every stored design_direction_id.
 */
export const WEBSITE_COMPOSITION_PROFILES: Record<WebsiteCompositionId, WebsiteCompositionProfile> = {
  editorial_luxury: {
    id: "editorial_luxury",
    nav: "bordered",
    hero: "editorial",
    sectionOrder: ["hero", "about", "gallery", "reservations", "hours", "contact"],
    reservationPlacement: "mid-page",
    radius: "2px",
    maxWidth: "1380px",
    displayScale: "clamp(4.7rem,9.2vw,9.4rem)",
    eyebrowTracking: ".3em",
    imageRatio: "4/5",
    sectionRule: "line",
  },
  refined_after_dark: {
    id: "refined_after_dark",
    nav: "transparent",
    hero: "offset",
    sectionOrder: ["hero", "gallery", "reservations", "about", "hours", "contact"],
    reservationPlacement: "hero-adjacent",
    radius: "0px",
    maxWidth: "1440px",
    displayScale: "clamp(4.8rem,10vw,10rem)",
    eyebrowTracking: ".32em",
    imageRatio: "3/4",
    sectionRule: "soft",
  },
  modern_minimal: {
    id: "modern_minimal",
    nav: "solid",
    hero: "reservation",
    sectionOrder: ["hero", "reservations", "about", "gallery", "hours", "contact"],
    reservationPlacement: "hero-adjacent",
    radius: "14px",
    maxWidth: "1240px",
    displayScale: "clamp(3.8rem,7.2vw,7.4rem)",
    eyebrowTracking: ".16em",
    imageRatio: "16/10",
    sectionRule: "none",
  },
  bold_social: {
    id: "bold_social",
    nav: "transparent",
    hero: "experience",
    sectionOrder: ["hero", "gallery", "about", "reservations", "hours", "contact"],
    reservationPlacement: "mid-page",
    radius: "34px",
    maxWidth: "1480px",
    displayScale: "clamp(4.8rem,11vw,11rem)",
    eyebrowTracking: ".08em",
    imageRatio: "16/9",
    sectionRule: "none",
  },
  classic_bistro: {
    id: "classic_bistro",
    nav: "bordered",
    hero: "story",
    sectionOrder: ["hero", "about", "hours", "reservations", "gallery", "contact"],
    reservationPlacement: "mid-page",
    radius: "0px",
    maxWidth: "1120px",
    displayScale: "clamp(3.7rem,7vw,7rem)",
    eyebrowTracking: ".24em",
    imageRatio: "5/7",
    sectionRule: "line",
  },
  coastal_airy: {
    id: "coastal_airy",
    nav: "transparent",
    hero: "framed",
    sectionOrder: ["hero", "gallery", "about", "reservations", "contact", "hours"],
    reservationPlacement: "after-hero",
    radius: "28px",
    maxWidth: "1360px",
    displayScale: "clamp(4.1rem,8vw,8rem)",
    eyebrowTracking: ".22em",
    imageRatio: "16/10",
    sectionRule: "none",
  },
  warm_neighborhood: {
    id: "warm_neighborhood",
    nav: "solid",
    hero: "split",
    sectionOrder: ["hero", "about", "reservations", "hours", "gallery", "contact"],
    reservationPlacement: "after-hero",
    radius: "20px",
    maxWidth: "1160px",
    displayScale: "clamp(3.5rem,6.5vw,6.4rem)",
    eyebrowTracking: ".12em",
    imageRatio: "4/3",
    sectionRule: "soft",
  },
  luxury_minimal: {
    id: "luxury_minimal",
    nav: "transparent",
    hero: "minimal",
    sectionOrder: ["hero", "about", "reservations", "gallery", "hours", "contact"],
    reservationPlacement: "after-hero",
    radius: "0px",
    maxWidth: "1040px",
    displayScale: "clamp(5.2rem,11vw,10.8rem)",
    eyebrowTracking: ".36em",
    imageRatio: "21/9",
    sectionRule: "line",
  },
  experiential_escape: {
    id: "experiential_escape",
    nav: "solid",
    hero: "experience",
    sectionOrder: ["hero", "gallery", "reservations", "about", "hours", "contact"],
    reservationPlacement: "hero-adjacent",
    radius: "22px",
    maxWidth: "1460px",
    displayScale: "clamp(4.4rem,9vw,9rem)",
    eyebrowTracking: ".1em",
    imageRatio: "16/9",
    sectionRule: "none",
  },
  creative_workshop: {
    id: "creative_workshop",
    nav: "solid",
    hero: "playful",
    sectionOrder: ["hero", "gallery", "about", "reservations", "hours", "contact"],
    reservationPlacement: "after-hero",
    radius: "38px",
    maxWidth: "1280px",
    displayScale: "clamp(4rem,8.4vw,8.2rem)",
    eyebrowTracking: ".07em",
    imageRatio: "5/4",
    sectionRule: "none",
  },
};

export function getWebsiteCompositionProfile(id: string | null | undefined) {
  const normalized = String(id || "modern_minimal") as WebsiteCompositionId;
  return WEBSITE_COMPOSITION_PROFILES[normalized] || WEBSITE_COMPOSITION_PROFILES.modern_minimal;
}
