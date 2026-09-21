import { describe, expect, it } from "vitest";
import { buildSearchHealthDebug } from "../../search/enterprise/searchHealthLogger";

describe("Search Health trust diagnostics", () => {
  it("preserves trust audit fields", () => {
    const debug = buildSearchHealthDebug({}, { trust: { personalizationMode: "disabled", personalizationConsentReason: "user_disabled", llmUsed: false, sponsoredResultCount: 1 } }) as any;
    expect(debug.trust).toMatchObject({ personalizationMode: "disabled", personalizationConsentReason: "user_disabled", llmUsed: false, sponsoredResultCount: 1 });
  });
});
