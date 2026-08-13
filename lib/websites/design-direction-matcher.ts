import { WEBSITE_DESIGN_DIRECTIONS } from "@/lib/websites/design-directions";

export type WebsiteDesignMatch = {
  id: string;
  confidence: "high" | "medium" | "low";
  reason?: string;
};

const allowedIds = new Set(WEBSITE_DESIGN_DIRECTIONS.map((direction) => direction.id));

export function buildDesignDirectionPrompt(vision: string, locationContext: Record<string, unknown>) {
  const catalog = WEBSITE_DESIGN_DIRECTIONS.map(({ id, name, summary, signals }) => ({ id, name, summary, signals }));
  return {
    system: "Match the business owner's website vision to approved TheOutHaven design directions. Choose only IDs from the supplied catalog. Return up to three unique ranked matches. Do not generate website copy or images.",
    user: `Owner vision: ${JSON.stringify(vision)}\nLocation context: ${JSON.stringify(locationContext)}\nApproved design directions: ${JSON.stringify(catalog)}\nReturn JSON only: {\"matches\":[{\"id\":\"approved_id\",\"confidence\":\"high|medium|low\",\"reason\":\"brief reason\"}]}`,
  };
}

export function normalizeDesignMatches(input: unknown): WebsiteDesignMatch[] {
  const rows = Array.isArray((input as any)?.matches) ? (input as any).matches : [];
  return rows
    .filter((item: any) => allowedIds.has(String(item?.id || "")))
    .filter((item: any, index: number, all: any[]) => all.findIndex((other) => String(other?.id || "") === String(item?.id || "")) === index)
    .slice(0, 3)
    .map((item: any) => ({
      id: String(item.id),
      confidence: ["high", "medium", "low"].includes(String(item.confidence)) ? String(item.confidence) as WebsiteDesignMatch["confidence"] : "medium",
      reason: String(item.reason || "Matched to your requested look and feel.").slice(0, 220),
    }));
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
      reason: "Matched to the style words in your description.",
    }));
}
