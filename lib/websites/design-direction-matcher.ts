import {
  WEBSITE_DESIGN_DIRECTIONS,
  getWebsiteDesignDirection,
  type WebsiteHeroStyle,
} from "@/lib/websites/design-directions";

export type WebsiteDesignStrategy = {
  variant: WebsiteHeroStyle;
  image_density: "low" | "medium";
  section_density: "airy" | "balanced" | "compact";
  reservation_mode: "hero_inline" | "hero_panel" | "sticky_primary";
  section_order: string[];
};

export type WebsiteDesignMatch = {
  id: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
  strategy: WebsiteDesignStrategy;
};

const allowedIds = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id));
const allowedSections = new Set([
  "hero",
  "reservations",
  "about",
  "gallery",
  "signature_experience",
  "private_events",
  "hours",
  "contact",
  "footer",
]);

export function deriveDesignStrategy(id: string, vision = ""): WebsiteDesignStrategy {
  const direction = getWebsiteDesignDirection(id) || WEBSITE_DESIGN_DIRECTIONS[0];
  const normalized = vision.toLowerCase();
  let variant = direction.defaultVariant;

  const preferred: WebsiteHeroStyle[] = [];
  if (/(no photo|no-photo|typography|text first|text-first|minimal image|quiet luxury)/.test(normalized)) preferred.push("typography_first");
  if (/(mosaic|collage|multiple photos|several photos|social|energetic|lively)/.test(normalized)) preferred.push("photo_mosaic");
  if (/(cinematic|wide strip|panoramic|dramatic)/.test(normalized)) preferred.push("cinematic_strip");
  if (/(asymmetric|editorial gallery|moody|romantic|nightlife)/.test(normalized)) preferred.push("asymmetric_gallery");
  if (/(framed|small photo|compact photo|subtle photo|airy)/.test(normalized)) preferred.push("framed_photo");
  if (/(split|two column|two-column|editorial)/.test(normalized)) preferred.push("editorial_split");

  const allowedPreferred = preferred.find((candidate) => direction.variants.includes(candidate));
  if (allowedPreferred) variant = allowedPreferred;

  const lowImage = direction.theme.imageTreatment === "minimal" || /(less photo|fewer photo|small image|minimal image|no photo)/.test(normalized);
  const compact = /(compact|dense|tight)/.test(normalized);
  const airy = /(airy|spacious|whitespace|editorial|luxury|minimal)/.test(normalized);
  const reservationPanel = direction.id === "modern_minimal" || /(reservation first|booking first|book immediately|reserve immediately)/.test(normalized);

  return {
    variant,
    image_density: lowImage ? "low" : "medium",
    section_density: compact ? "compact" : airy ? "airy" : direction.theme.density,
    reservation_mode: reservationPanel ? "hero_panel" : "hero_inline",
    section_order: ["hero", "reservations", "about", "gallery", "hours", "contact", "footer"],
  };
}

export function buildDesignDirectionPrompt(vision: string, locationContext: Record<string, unknown>) {
  const catalog = WEBSITE_DESIGN_DIRECTIONS.map(({ id, name, summary, signals, variants, defaultVariant, theme }) => ({
    id,
    name,
    summary,
    signals,
    variants,
    defaultVariant,
    mood: theme.mood,
    typography: theme.typography,
    density: theme.density,
    imageTreatment: theme.imageTreatment,
  }));

  return {
    system: [
      "Act as a hospitality web design creative director.",
      "Match the owner's request to approved TheOutHaven design systems only.",
      "Reservation or booking is always the primary conversion goal.",
      "Real business photos only; never propose or request AI-generated imagery.",
      "Prefer controlled image layouts over oversized full-screen hero photos.",
      "Choose a permitted hero variant for each selected design system.",
      "Return up to three unique ranked matches and a concise structured strategy for each.",
      "Do not generate HTML, CSS, website copy, fabricated facts, or images.",
    ].join(" "),
    user: `Owner vision: ${JSON.stringify(vision)}\nLocation context: ${JSON.stringify(locationContext)}\nApproved design systems: ${JSON.stringify(catalog)}\nReturn JSON only: {"matches":[{"id":"approved_id","confidence":"high|medium|low","reason":"brief reason","strategy":{"variant":"allowed_variant","image_density":"low|medium","section_density":"airy|balanced|compact","reservation_mode":"hero_inline|hero_panel|sticky_primary","section_order":["hero","reservations","about","gallery","hours","contact","footer"]}}]}`,
  };
}

function normalizeStrategy(id: string, input: unknown): WebsiteDesignStrategy {
  const defaults = deriveDesignStrategy(id);
  const direction = getWebsiteDesignDirection(id);
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};

  const requestedVariant = String(value.variant || "") as WebsiteHeroStyle;
  const variant = direction?.variants.includes(requestedVariant) ? requestedVariant : defaults.variant;
  const imageDensity = ["low", "medium"].includes(String(value.image_density))
    ? String(value.image_density) as WebsiteDesignStrategy["image_density"]
    : defaults.image_density;
  const sectionDensity = ["airy", "balanced", "compact"].includes(String(value.section_density))
    ? String(value.section_density) as WebsiteDesignStrategy["section_density"]
    : defaults.section_density;
  const reservationMode = ["hero_inline", "hero_panel", "sticky_primary"].includes(String(value.reservation_mode))
    ? String(value.reservation_mode) as WebsiteDesignStrategy["reservation_mode"]
    : defaults.reservation_mode;
  const requestedOrder = Array.isArray(value.section_order)
    ? value.section_order.map(String).filter((section) => allowedSections.has(section))
    : [];
  const sectionOrder = Array.from(new Set(requestedOrder));
  if (!sectionOrder.includes("hero")) sectionOrder.unshift("hero");
  if (!sectionOrder.includes("reservations")) sectionOrder.splice(1, 0, "reservations");

  return {
    variant,
    image_density: imageDensity,
    section_density: sectionDensity,
    reservation_mode: reservationMode,
    section_order: sectionOrder.length >= 4 ? sectionOrder : defaults.section_order,
  };
}

export function normalizeDesignMatches(input: unknown): WebsiteDesignMatch[] {
  const rows = Array.isArray((input as { matches?: unknown[] })?.matches) ? (input as { matches: unknown[] }).matches : [];
  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter((item) => allowedIds.has(String(item.id || "")))
    .filter((item, index, all) => all.findIndex((other) => String(other.id || "") === String(item.id || "")) === index)
    .slice(0, 3)
    .map((item) => {
      const id = String(item.id);
      return {
        id,
        confidence: ["high", "medium", "low"].includes(String(item.confidence))
          ? String(item.confidence) as WebsiteDesignMatch["confidence"]
          : "medium",
        reason: String(item.reason || "Matched to your requested look, audience, and booking goal.").slice(0, 220),
        strategy: normalizeStrategy(id, item.strategy),
      };
    });
}

export function fallbackDesignMatches(vision: string): WebsiteDesignMatch[] {
  const normalized = vision.toLowerCase();
  return WEBSITE_DESIGN_DIRECTIONS
    .map((direction) => ({
      direction,
      score: direction.signals.reduce((score, signal) => score + (normalized.includes(signal.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ direction }, index) => ({
      id: direction.id,
      confidence: index === 0 ? "high" : "medium",
      reason: "Matched to the style words in your description while keeping reservations primary.",
      strategy: deriveDesignStrategy(direction.id, vision),
    }));
}
