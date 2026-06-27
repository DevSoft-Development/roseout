import { describe, expect, it } from "vitest";
import { applyApprovedSearchPhraseMapping, detectVagueLanguageSignals, getPhraseKey, normalizeSearchPhrase } from "../searchPhraseLearning";

describe("search phrase learning", () => {
  it("normalizes and groups vague after-dinner phrases", () => {
    expect(normalizeSearchPhrase("Something fun after dinner!!!")).toBe("something fun after dinner");
    expect(getPhraseKey("Something fun after dinner")).toBe(getPhraseKey("I want something fun after dinner"));
  });
  it("detects vague language signals", () => {
    const signals = detectVagueLanguageSignals("grown cute date night, girls night birthday, family friendly, not too loud with a vibe");
    for (const signal of ["grown", "cute", "date night", "girls night", "birthday", "family friendly", "not too loud", "vibe"]) expect(signals).toContain(signal);
  });
  it("enriches vague intent without erasing existing parser intent", () => {
    const merged = applyApprovedSearchPhraseMapping("something fun after dinner", { restaurantIntent: { mealTerms:["dinner"], cuisineTerms:[], foodTerms:[], categoryTerms:[], vibeTerms:[], featureTerms:[], negativeTerms:[] }, activityIntent: { activityTerms:[], categoryTerms:[], vibeTerms:[], featureTerms:[], negativeTerms:[] }, vibe: [] } as any, { id:"m1", phrase_key:"something fun|after dinner", display_phrase:"something fun after dinner", confidence_score:80, approved_intent:{ searchType:"mixed_outing", needsRestaurant:true, needsActivity:true, wantsPairing:true, mealTerms:["dinner"] }, activity_types:["bowling","comedy"], cuisines:["italian"], vibes:["fun"] });
    expect(merged.searchLearningApplied).toBe(true); expect(merged.activityIntent?.activityTerms).toContain("bowling"); expect(merged.restaurantIntent?.mealTerms).toContain("dinner");
  });
  it("lets explicit activity and cuisine terms win", () => {
    const merged = applyApprovedSearchPhraseMapping("something fun after dinner and bowling with sushi", { restaurantIntent: { mealTerms:["dinner"], cuisineTerms:["sushi"], foodTerms:[], categoryTerms:[], vibeTerms:[], featureTerms:[], negativeTerms:[] }, activityIntent: { activityTerms:["bowling"], categoryTerms:[], vibeTerms:[], featureTerms:[], negativeTerms:[] }, vibe: [] } as any, { phrase_key:"something fun|after dinner", display_phrase:"something fun after dinner", approved_intent:{ searchType:"mixed_outing", needsRestaurant:true, needsActivity:true }, activity_types:["comedy","karaoke"], cuisines:["italian"] });
    expect(merged.activityIntent?.activityTerms).toEqual(["bowling"]); expect(merged.restaurantIntent?.cuisineTerms).toEqual(["sushi"]);
  });
});
