import { defaultWebsiteSections, type WebsiteSection } from "@/lib/websites/data";
import { getWebsiteDesignDirection, WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";

export const WEBSITE_BLUEPRINT_VERSION = 3 as const;

export const WEBSITE_BLUEPRINT_SECTION_TYPES = [
  "hero",
  "about",
  "gallery",
  "hours",
  "contact",
  "reservations",
  "menu",
  "offers",
  "custom",
] as const;

export type WebsiteBlueprintSectionType = (typeof WEBSITE_BLUEPRINT_SECTION_TYPES)[number];

export type WebsiteBlueprint = {
  version: 3;
  businessIdentity: {
    category: string;
    positioning: string;
    audience: string;
    primaryIntent: string;
  };
  design: {
    directionId: string;
    rationale: string;
    visualHierarchy: "conversion_first" | "story_first" | "experience_first" | "balanced";
    imageStrategy: "hero_first" | "editorial" | "gallery_forward" | "minimal";
  };
  conversion: {
    primaryCta: "reserve" | "book" | "call" | "visit" | "view_menu";
    primaryLabel: string;
    secondaryCta: "call" | "directions" | "view_menu" | "none";
    secondaryLabel: string;
    strategy: string;
  };
  sections: Array<{
    id: string;
    type: WebsiteBlueprintSectionType;
    enabled: boolean;
    heading?: string;
    body?: string;
  }>;
  copy: {
    heroHeading: string;
    heroSubheading: string;
    aboutHeading: string;
    aboutBody: string;
    seoTitle: string;
    seoDescription: string;
  };
};

const allowedDirectionIds = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id));
const allowedSectionTypes = new Set<string>(WEBSITE_BLUEPRINT_SECTION_TYPES);

function text(value: unknown, max: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim().replace(/\s+/g, " ").slice(0, max) || fallback;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function fallbackWebsiteBlueprint(input: {
  name: string;
  category?: string | null;
  vision?: string | null;
  directionId?: string | null;
}): WebsiteBlueprint {
  const direction = getWebsiteDesignDirection(input.directionId || "") || WEBSITE_DESIGN_DIRECTIONS[2];
  const name = text(input.name, 120, "Your business");
  const category = text(input.category, 80, "local experience");
  const isActivity = /activity|studio|workshop|experience|attraction|escape|bowling|golf|pottery|paint|class/i.test(category);
  const primaryCta = isActivity ? "book" : "reserve";
  const primaryLabel = isActivity ? "Book your experience" : "Reserve your table";

  return {
    version: WEBSITE_BLUEPRINT_VERSION,
    businessIdentity: {
      category,
      positioning: text(input.vision, 220, `${name} is presented as a polished, trustworthy ${category}.`),
      audience: isActivity ? "Guests planning a memorable outing" : "Guests planning where to eat, drink, and spend time",
      primaryIntent: isActivity ? "book an experience" : "make a reservation",
    },
    design: {
      directionId: direction.id,
      rationale: `Use ${direction.name} to match the business context while keeping conversion clear.`,
      visualHierarchy: isActivity ? "experience_first" : "conversion_first",
      imageStrategy: direction.theme.imageTreatment === "minimal" ? "minimal" : direction.theme.imageTreatment === "grid" ? "gallery_forward" : "editorial",
    },
    conversion: {
      primaryCta,
      primaryLabel,
      secondaryCta: "call",
      secondaryLabel: "Call",
      strategy: isActivity ? "Lead with the experience, then make booking the clearest next action." : "Lead with the atmosphere and value, then keep reservations visible throughout the page.",
    },
    sections: defaultWebsiteSections.map((section) => ({
      id: section.id,
      type: section.type,
      enabled: section.enabled,
    })),
    copy: {
      heroHeading: name,
      heroSubheading: isActivity ? `Make your next outing memorable at ${name}.` : `Plan your next visit to ${name}.`,
      aboutHeading: isActivity ? "An experience worth making time for" : "A place worth making plans for",
      aboutBody: isActivity ? `Discover what makes ${name} a strong choice for your next outing, then book the time that works for you.` : `Discover ${name}, explore the experience, and reserve the time that works for you.`,
      seoTitle: `${name} | Official Website`,
      seoDescription: `Visit ${name}. View details, hours, and availability, then plan your visit.`,
    },
  };
}

export function normalizeWebsiteBlueprint(value: unknown, fallback: WebsiteBlueprint): WebsiteBlueprint {
  const root = objectValue(value);
  const identity = objectValue(root.businessIdentity);
  const design = objectValue(root.design);
  const conversion = objectValue(root.conversion);
  const copy = objectValue(root.copy);
  const rawDirectionId = text(design.directionId, 64, fallback.design.directionId);
  const directionId = allowedDirectionIds.has(rawDirectionId) ? rawDirectionId : fallback.design.directionId;

  const seen = new Set<string>();
  const rawSections = Array.isArray(root.sections) ? root.sections : [];
  const sections: WebsiteBlueprint["sections"] = [];
  rawSections.forEach((item, index) => {
    const section = objectValue(item);
    const type = text(section.type, 40) as WebsiteBlueprintSectionType;
    if (!allowedSectionTypes.has(type) || seen.has(type)) return;
    seen.add(type);
    const heading = text(section.heading, 120);
    const body = text(section.body, 700);
    sections.push({
      id: text(section.id, 60, type || `section-${index}`),
      type,
      enabled: section.enabled !== false,
      ...(heading ? { heading } : {}),
      ...(body ? { body } : {}),
    });
  });

  for (const required of ["hero", "reservations", "contact"] as WebsiteBlueprintSectionType[]) {
    if (!seen.has(required)) {
      const base = fallback.sections.find((section) => section.type === required);
      if (base) sections.push({ ...base });
    }
  }

  return {
    version: WEBSITE_BLUEPRINT_VERSION,
    businessIdentity: {
      category: text(identity.category, 80, fallback.businessIdentity.category),
      positioning: text(identity.positioning, 260, fallback.businessIdentity.positioning),
      audience: text(identity.audience, 180, fallback.businessIdentity.audience),
      primaryIntent: text(identity.primaryIntent, 120, fallback.businessIdentity.primaryIntent),
    },
    design: {
      directionId,
      rationale: text(design.rationale, 320, fallback.design.rationale),
      visualHierarchy: enumValue(design.visualHierarchy, ["conversion_first", "story_first", "experience_first", "balanced"] as const, fallback.design.visualHierarchy),
      imageStrategy: enumValue(design.imageStrategy, ["hero_first", "editorial", "gallery_forward", "minimal"] as const, fallback.design.imageStrategy),
    },
    conversion: {
      primaryCta: enumValue(conversion.primaryCta, ["reserve", "book", "call", "visit", "view_menu"] as const, fallback.conversion.primaryCta),
      primaryLabel: text(conversion.primaryLabel, 48, fallback.conversion.primaryLabel),
      secondaryCta: enumValue(conversion.secondaryCta, ["call", "directions", "view_menu", "none"] as const, fallback.conversion.secondaryCta),
      secondaryLabel: text(conversion.secondaryLabel, 48, fallback.conversion.secondaryLabel),
      strategy: text(conversion.strategy, 320, fallback.conversion.strategy),
    },
    sections: sections.length ? sections.slice(0, WEBSITE_BLUEPRINT_SECTION_TYPES.length) : fallback.sections,
    copy: {
      heroHeading: text(copy.heroHeading, 100, fallback.copy.heroHeading),
      heroSubheading: text(copy.heroSubheading, 240, fallback.copy.heroSubheading),
      aboutHeading: text(copy.aboutHeading, 100, fallback.copy.aboutHeading),
      aboutBody: text(copy.aboutBody, 700, fallback.copy.aboutBody),
      seoTitle: text(copy.seoTitle, 70, fallback.copy.seoTitle),
      seoDescription: text(copy.seoDescription, 160, fallback.copy.seoDescription),
    },
  };
}

export function blueprintToWebsiteSections(blueprint: WebsiteBlueprint, current: WebsiteSection[] = defaultWebsiteSections): WebsiteSection[] {
  const bindings = new Map(current.map((section) => [section.type, section.liveBindings]));
  return blueprint.sections.map((section) => ({
    id: section.id,
    type: section.type,
    enabled: section.enabled,
    heading: section.heading,
    body: section.body,
    liveBindings: bindings.get(section.type),
  }));
}

export function blueprintGeneratedContent(blueprint: WebsiteBlueprint) {
  return {
    hero: {
      heading: blueprint.copy.heroHeading,
      subheading: blueprint.copy.heroSubheading,
      ctaLabel: blueprint.conversion.primaryLabel,
    },
    about: {
      heading: blueprint.copy.aboutHeading,
      body: blueprint.copy.aboutBody,
    },
    seo: {
      title: blueprint.copy.seoTitle,
      description: blueprint.copy.seoDescription,
    },
  };
}

export function buildWebsiteBlueprintPrompt(input: {
  vision: string;
  location: Record<string, unknown>;
  fallback: WebsiteBlueprint;
}) {
  return {
    system: [
      "You are TheOutHaven Website Architect V3.",
      "Return exactly one JSON object matching the supplied blueprint shape.",
      "Do not output HTML, CSS, JavaScript, markdown, URLs, fake reviews, fake awards, fake amenities, fake menu items, or invented factual claims.",
      "Use only the supplied business facts. You may write tasteful marketing copy that does not add unverifiable facts.",
      `Allowed design direction ids: ${WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id).join(", ")}.`,
      `Allowed section types: ${WEBSITE_BLUEPRINT_SECTION_TYPES.join(", ")}.`,
      "Keep hero, reservations, and contact enabled. Order sections intentionally for the visitor journey.",
      "Use real-location imagery only; imageStrategy controls placement, never image generation.",
      "Prioritize clear conversion while preserving an upscale, credible business-specific feel.",
    ].join("\n"),
    user: JSON.stringify({
      task: "Create a complete Website Blueprint V3.",
      ownerVision: input.vision,
      location: input.location,
      requiredShape: input.fallback,
    }),
  };
}
