import { describe, expect, it } from "vitest";
import {
  bindGuidedVenuePreferences,
  evaluateHoursAtLocalTime,
  preferenceAdjustment,
  resolvePlannedLocalTime,
} from "../runtimeSearchIntelligence";

const language = (overrides: Record<string, any> = {}) => ({
  originalQuery: "date night in Brooklyn",
  effectiveQuery: "date night in Brooklyn",
  relationship: { type: "any", evidence: [] },
  negatives: { restaurant: [], activity: [], vibes: [], geo: [] },
  preferences: { vibes: [], subjectiveTerms: [], budget: null, noise: null },
  ambiguityReasons: [],
  llmUsed: false,
  llmModel: null,
  llmConfidence: null,
  llmRelationship: null,
  llmSoftVibes: [],
  llmAvoidTerms: [],
  ...overrides,
}) as any;

describe("runtime Search V2 intelligence", () => {
  it("keeps guided venue features soft instead of creating another search lane", () => {
    const result = bindGuidedVenuePreferences("Date night in Brooklyn. Preferences: rooftop, romantic, quiet");
    expect(result.boundVenuePreferences).toContain("rooftop");
    expect(result.plannerQuery).not.toMatch(/preferences:\s*rooftop/i);
    expect(result.plannerQuery).toMatch(/romantic/i);
    expect(result.plannerQuery).toMatch(/quiet/i);
  });

  it("does not rewrite ordinary sequential hookah language", () => {
    const result = bindGuidedVenuePreferences("Dinner then hookah in Forest Hills");
    expect(result.boundVenuePreferences).toEqual([]);
    expect(result.plannerQuery).toBe("Dinner then hookah in Forest Hills");
  });

  it("soft-binds hookah when it came from a guided preference clause", () => {
    const result = bindGuidedVenuePreferences("Dinner in Forest Hills. Preferences: hookah, chill");
    expect(result.boundVenuePreferences).toContain("hookah");
    expect(result.plannerQuery).not.toMatch(/preferences:\s*hookah/i);
    expect(result.plannerQuery).toMatch(/chill/i);
  });

  it("evaluates weekly Google hours across midnight", () => {
    const row = {
      google_regular_opening_hours: {
        periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 2, hour: 3, minute: 0 } }],
      },
    };
    expect(evaluateHoursAtLocalTime(row, { day: 2, minuteOfDay: 60, source: "natural_language", label: "Tuesday 1:00" })).toBe("open");
    expect(evaluateHoursAtLocalTime(row, { day: 2, minuteOfDay: 240, source: "natural_language", label: "Tuesday 4:00" })).toBe("closed");
  });

  it("evaluates day-map hours and closed weekdays", () => {
    const row = { operating_hours: { monday: ["5:00 PM - 10:00 PM"], tuesday: ["Closed"] } };
    expect(evaluateHoursAtLocalTime(row, { day: 1, minuteOfDay: 19 * 60, source: "natural_language", label: "Monday 19:00" })).toBe("open");
    expect(evaluateHoursAtLocalTime(row, { day: 2, minuteOfDay: 19 * 60, source: "natural_language", label: "Tuesday 19:00" })).toBe("closed");
  });

  it("understands natural planned time without changing non-temporal searches", () => {
    expect(resolvePlannedLocalTime("dinner in Brooklyn", null, new Date("2026-08-25T16:00:00Z"))).toBeNull();
    const planned = resolvePlannedLocalTime("dinner tomorrow at 9:30 pm", null, new Date("2026-08-25T16:00:00Z"));
    expect(planned?.minuteOfDay).toBe(21 * 60 + 30);
  });

  it("strongly demotes child-specific activities for date night", () => {
    const child = preferenceAdjustment(
      { name: "Brooklyn Children's Museum", primary_category: "children's museum" },
      { language: language(), boundVenuePreferences: [], occasion: "date_night" },
      "activity",
    );
    const comedy = preferenceAdjustment(
      { name: "Comedy Cellar", primary_category: "comedy club" },
      { language: language(), boundVenuePreferences: [], occasion: "date_night" },
      "activity",
    );
    expect(child.adjustment).toBeLessThan(-20);
    expect(comedy.adjustment).toBeGreaterThan(0);
  });

  it("prefers conversation-friendly places when the user asks for quiet", () => {
    const context = {
      language: language({ preferences: { vibes: ["conversation_friendly"], subjectiveTerms: ["quiet"], budget: null, noise: "quiet" } }),
      boundVenuePreferences: [],
      occasion: "date_night",
    } as any;
    const quiet = preferenceAdjustment({ name: "Cozy Wine Bar", vibe_tags: ["quiet", "intimate", "conversation_friendly"] }, context, "restaurant");
    const loud = preferenceAdjustment({ name: "Party Room", vibe_tags: ["loud", "nightclub", "dance floor"] }, context, "restaurant");
    expect(quiet.adjustment).toBeGreaterThan(loud.adjustment);
  });
});
