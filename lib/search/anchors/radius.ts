import type { SearchAnchor } from "./types";

export function anchorRadiusPolicy(anchor: Pick<SearchAnchor, "anchor_type" | "radius_strategy" | "default_radius_miles" | "max_radius_miles">) {
  const fallback: Record<string, [number, number]> = {
    restaurant: [1, 1.5], activity: [1, 1.5], dense_urban: [0.75, 1.25], urban: [1, 2], transit: [1, 1.5], stadium: [1.5, 3], mall: [2, 5], beach: [3, 8], large_park: [2, 5], suburban: [3, 8], long_island: [3, 8], airport: [3, 8],
  };
  const byStrategy = fallback[anchor.radius_strategy] ?? fallback[anchor.anchor_type] ?? [1.5, 3];
  const initialRadiusMiles = Number(anchor.default_radius_miles || byStrategy[0]);
  const maxRadiusMiles = Math.max(initialRadiusMiles, Number(anchor.max_radius_miles || byStrategy[1]));
  return { initialRadiusMiles, maxRadiusMiles, strategy: anchor.radius_strategy };
}

export function minimumResultTarget(domain: "restaurant" | "activity", qualifier?: string | null) {
  if (qualifier && qualifier.trim().split(/\s+/).length > 1) return 3;
  if (domain === "activity") return 6;
  return qualifier ? 4 : 8;
}

export function expansionSteps(initial: number, max: number) {
  const steps = [initial];
  let next = initial;
  while (next < max) { next = Math.min(max, Number((next * 1.5).toFixed(2))); if (!steps.includes(next)) steps.push(next); }
  return steps;
}
