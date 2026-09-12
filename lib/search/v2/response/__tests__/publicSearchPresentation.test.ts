import { describe, expect, it } from "vitest";
import { humanizePublicTaxonomyLabel, sanitizePublicLocation } from "../sanitizePublicLocation";

describe("public search presentation", () => {
  it("humanizes internal taxonomy identifiers before they reach customer cards", () => {
    expect(humanizePublicTaxonomyLabel("sports_bar")).toBe("Sports Bar");
    expect(humanizePublicTaxonomyLabel("fine-dining")).toBe("Fine Dining");
    const location = sanitizePublicLocation({ id: "1", primary_category: "sports_bar", cuisine: "spanish", activity_type: "live_music" } as any);
    expect(location.primary_category).toBe("Sports Bar");
    expect(location.cuisine).toBe("Spanish");
    expect(location.activity_type).toBe("Live Music");
  });
});
