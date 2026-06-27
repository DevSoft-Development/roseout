import { describe, expect, it } from "vitest";
import { aggregateReviewSignals, calculateIntentReviewFit, calculatePairReviewFit, extractReviewSignals, getReviewPenaltyForIntent } from "../reviewIntelligence";

const review = (text: string, extra: any = {}) => ({ status: "approved", location_id: "loc", review_text: text, rating: 5, verified_visit: true, created_at: new Date().toISOString(), ...extra });

describe("Review Intelligence ML", () => {
  it("detects review signal families", () => {
    const signals = extractReviewSignals(review("Quiet cozy romantic date night with conversation, pictures, family friendly, but slow service and long wait and overpriced."));
    expect(signals.quiet).toBe(true); expect(signals.romantic).toBe(true); expect(signals.family).toBe(true); expect(signals.photo).toBe(true); expect(signals.serviceIssue).toBe(true); expect(signals.waitIssue).toBe(true); expect(signals.valueIssue).toBe(true);
    expect(extractReviewSignals(review("loud dj girls night group friends lively birthday"))).toMatchObject({ loud: true, group: true, girlsNight: true, birthday: true });
  });

  it("gates quiet-search penalties until repeated support exists", () => {
    const one = aggregateReviewSignals([review("loud noisy packed")]);
    expect(getReviewPenaltyForIntent({ rawQuery: "quiet date night" }, one)).toBeLessThan(8);
    const three = aggregateReviewSignals([review("loud noisy packed"), review("very loud dj"), review("crowded and noisy")]);
    expect(getReviewPenaltyForIntent({ rawQuery: "quiet date night" }, three)).toBeGreaterThan(8);
    const offset = aggregateReviewSignals([review("loud"), review("quiet romantic conversation"), review("quiet cozy date night")]);
    expect(calculateIntentReviewFit({ rawQuery: "quiet date night" }, offset)).toBeGreaterThan(0);
  });

  it("scores intent-specific behavior", () => {
    const lively = aggregateReviewSignals([review("loud lively dj girls night birthday group photo worthy"), review("party vibe cocktails friends"), review("packed fun birthday")]);
    expect(calculateIntentReviewFit({ rawQuery: "birthday girls night" }, lively)).toBeGreaterThan(0);
    expect(getReviewPenaltyForIntent({ rawQuery: "quiet conversation date" }, lively)).toBeGreaterThan(0);
    const fam = aggregateReviewSignals([review("family friendly kids spacious great service")]);
    expect(calculateIntentReviewFit({ rawQuery: "family friendly dinner" }, fam)).toBeGreaterThan(0);
  });

  it("handles pair review fit", () => {
    const restaurant = aggregateReviewSignals([review("quiet romantic cozy date night")]);
    const activity = aggregateReviewSignals([review("quiet intimate scenic museum")]);
    expect(calculatePairReviewFit(restaurant, activity, { rawQuery: "quiet date night" })).toBeGreaterThan(0);
    const loud = aggregateReviewSignals([review("loud dj")]);
    expect(calculatePairReviewFit(restaurant, loud, { rawQuery: "quiet date night" })).toBeGreaterThanOrEqual(0);
  });
});
