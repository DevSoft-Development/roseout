export const WEBSITE_GENERATION_POLICY = {
  initialGenerationIncluded: 1,
  fullRedesignsPerMonth: 2,
  sectionRewritesPerMonth: 40,
  maxConcurrentGenerations: 1,
  aiImageGenerationEnabled: false,
} as const;

export type WebsiteGenerationType = "initial_generation" | "section_rewrite" | "full_redesign";

export function generationLimitFor(type: WebsiteGenerationType) {
  if (type === "initial_generation") return WEBSITE_GENERATION_POLICY.initialGenerationIncluded;
  if (type === "full_redesign") return WEBSITE_GENERATION_POLICY.fullRedesignsPerMonth;
  return WEBSITE_GENERATION_POLICY.sectionRewritesPerMonth;
}
