import { describe, expect, it } from "vitest";
import { buildSearchPlan } from "../planner/buildSearchPlan";
const cases = [
  ["Sushi in Flushing with karaoke after", "paired_outing", "sushi", "karaoke", "Flushing"],
  ["Steak dinner and rooftop drinks in Manhattan", "same_venue", "steakhouse", "rooftop", null],
  ["Best bar to watch the Knicks game in Harlem", "activity_only", null, "sports_watch", "Harlem"],
  ["Restaurant near Gaming City in Astoria", "anchored_nearby", null, null, "Astoria"],
] as const;
describe("Search Core V2 permanent QA", () => { for (const [query, mode, cuisine, activity, neighborhood] of cases) it(query, async () => { const plan = await buildSearchPlan({ input: { query } }); expect(plan.mode).toBe(mode); if (cuisine) expect(plan.restaurant.cuisines).toContain(cuisine); if (activity) expect(plan.activity.categories).toContain(activity); expect(plan.geo.neighborhood).toBe(neighborhood); expect(Object.isFrozen(plan)).toBe(true); }); });
