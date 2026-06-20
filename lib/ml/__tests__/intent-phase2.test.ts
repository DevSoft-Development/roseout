import { describe, expect, it } from "vitest";
import { classifySearchIntent } from "../intentBuckets";
import { calculateLocationIntentScore, calculatePairScore } from "../intentScoring";
describe("Phase 2 intent classifier", () => {
 it.each([
  ["date night in Queens", "date_night"], ["seafood restaurant in Queens", "seafood"], ["steakhouse near me", "steakhouse"], ["bowling near me tonight", "bowling"], ["wheelchair accessible brunch spot", "brunch"],
 ])("classifies %s", (query, primary) => expect(classifySearchIntent(query).primaryIntent).toBe(primary));
 it("romantic dinner near me tonight",()=>{ const c=classifySearchIntent("romantic dinner near me tonight"); expect(c.primaryIntent).toBe("romantic"); expect(c.secondaryIntents).toEqual(expect.arrayContaining(["dinner","near_me"])); expect(c.allIntents).toContain("romantic"); });
 it("birthday dinner with activity after",()=>{ const c=classifySearchIntent("birthday dinner with activity after"); expect(c.primaryIntent).toBe("birthday"); expect(c.secondaryIntents).toEqual(expect.arrayContaining(["dinner","activity_after_dinner","mixed_outing"])); expect(c.inferredSearchMode).toBe("mixed_outing"); });
 it("girls night drinks and lounge in Brooklyn",()=>{ const c=classifySearchIntent("girls night drinks and lounge in Brooklyn"); expect(c.primaryIntent).toBe("girls_night"); expect(c.secondaryIntents).toEqual(expect.arrayContaining(["drinks","lounge"])); });
 it("brunch and museum date",()=>{ const c=classifySearchIntent("brunch and museum date"); expect(c.allIntents).toEqual(expect.arrayContaining(["brunch","museum"])); expect(c.allIntents).toContain("mixed_outing"); });
 it("Black-owned romantic restaurant",()=>{ const c=classifySearchIntent("Black-owned romantic restaurant"); expect(c.primaryIntent).toBe("romantic"); expect(c.secondaryIntents).toContain("black_owned"); });
 it("empty",()=>{ const c=classifySearchIntent(""); expect(c.primaryIntent).toBe("general"); expect(c.allIntents).toEqual(["general"]); expect(c.confidence).toBeLessThan(0.3); expect(c.inferredSearchMode).toBe("unknown"); });
});
describe("Phase 2 scoring",()=>{
 it("location scores are bounded and improve with engagement",()=>{ const zero=calculateLocationIntentScore({}); const high=calculateLocationIntentScore({impressions_30d:100, clicks_30d:30, views_30d:80, saves_30d:10, completed_outings_30d:5}); expect(zero).toBeGreaterThanOrEqual(0); expect(high).toBeGreaterThan(zero); expect(high).toBeLessThanOrEqual(100); });
 it("location low samples are dampened and negatives reduce",()=>{ const low=calculateLocationIntentScore({impressions_30d:4, clicks_30d:4, completed_outings_30d:4}); const neg=calculateLocationIntentScore({impressions_30d:100, clicks_30d:30, completed_outings_30d:5, negative_signals_30d:10}); const clean=calculateLocationIntentScore({impressions_30d:100, clicks_30d:30, completed_outings_30d:5}); expect(low).toBeLessThan(clean); expect(neg).toBeLessThan(clean); });
 it("pair score completed outings and distance matter",()=>{ const far=calculatePairScore({impressions_30d:100, clicks_30d:10, completed_outings_30d:1, pair_distance_miles:8}); const near=calculatePairScore({impressions_30d:100, clicks_30d:10, completed_outings_30d:5, pair_distance_miles:.4}); expect(near).toBeGreaterThan(far); expect(near).toBeLessThanOrEqual(100); expect(calculatePairScore({impressions_30d:100, clicks_30d:10, completed_outings_30d:5, pair_distance_miles:.4, negative_signals_30d:10})).toBeLessThan(near); });
});
