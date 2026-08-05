import { describe, expect, it } from "vitest";

import { parseEnterpriseIntent } from "../intent-parser";

const activityQueries = [
  "Romantic Italian dinner with live jazz in Manhattan tonight",
  "Italian dinner with karaoke in Queens",
  "Sushi dinner with an escape room in Garden City",
  "Brunch with bowling in Brooklyn",
  "Dinner with a comedy show in Manhattan",
  "Dinner with paint and sip in Queens",
];

describe("public generate activity intent contract", () => {
  it.each(activityQueries)(
    "keeps restaurant and activity requirements for %s",
    async (query) => {
      const parsed = await parseEnterpriseIntent(query, {
        useLLM: false,
        useFastPath: true,
        body: { selectedSearchLane: "auto" },
      });

      expect(parsed.intent.needsRestaurant).toBe(true);
      expect(parsed.intent.needsActivity).toBe(true);
      expect(parsed.intent.wantsPairing).toBe(true);
      expect(parsed.intent.primaryDomain).toBe("mixed");
      expect(parsed.intent.activityIntent.activityTerms.length).toBeGreaterThan(0);
      expect(parsed.intent.fallbackPairAllowed).toBe(true);
      expect(parsed.intent.sameLocationRequired).toBe(false);
    },
  );
});
