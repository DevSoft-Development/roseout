import { describe, expect, it } from "vitest";
import { allowsInferredActivityCategories } from "../applyLearnedIntent";

describe("generic activity category inference", () => {
  it("keeps broad activity wording category neutral", () => {
    expect(allowsInferredActivityCategories("Steak night and activities in Long Island. Romantic, lively.")).toBe(false);
    expect(allowsInferredActivityCategories("Dinner and something fun nearby")).toBe(false);
    expect(allowsInferredActivityCategories("Restaurant and an activity after")).toBe(false);
  });

  it("allows category inference only when the user names an activity concept", () => {
    expect(allowsInferredActivityCategories("Steakhouse and bowling")).toBe(true);
    expect(allowsInferredActivityCategories("Dinner then a hookah lounge")).toBe(true);
    expect(allowsInferredActivityCategories("Sushi and live music")).toBe(true);
  });
});
