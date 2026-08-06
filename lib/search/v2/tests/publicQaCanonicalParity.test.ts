import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assignSearchCoreVersion,
  validateSearchCoreConfig,
} from "@/lib/search/searchCoreConfig";
import { validateSearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

describe("public and Search Health QA execution parity", () => {
  it("keeps Search Core on V2 for all public traffic", () => {
    const config = validateSearchCoreConfig({
      mode: "v2",
      rolloutPercentage: 100,
      killSwitch: false,
      internalOnly: false,
      shadowEnabled: false,
    });

    const assignment = assignSearchCoreVersion({
      config: {
        ...config,
        source: "database",
        updatedAt: null,
        updatedBy: null,
      },
      requestId: "public-qa-parity",
      anonymousSessionId: "public-qa-parity-session",
    });

    expect(assignment.engine).toBe("v2");
    expect(assignment.percentage).toBe(100);
    expect(assignment.reason).toBe("v2_primary");
  });

  it("keeps canonical profiles primary for all V2 traffic", () => {
    const profile = validateSearchProfileRolloutConfig({
      mode: "primary",
      canaryPercent: 100,
      killSwitch: false,
    });

    expect(profile).toEqual({
      mode: "primary",
      canaryPercent: 100,
      killSwitch: false,
    });
  });

  it("runs Search Health QA through the same public controller and route contract", () => {
    const qaRoute = readFileSync(
      "app/api/admin/search-health/batch-run/route.ts",
      "utf8",
    );

    expect(qaRoute).toContain(
      'import { createPublicSearchController } from "@/lib/search/public-api/controller"',
    );
    expect(qaRoute).toContain(
      'new Request("http://internal/api/generate"',
    );
    expect(qaRoute).toContain('executionPath: "/api/generate"');
    expect(qaRoute).not.toContain("rolloutOverride");
    expect(qaRoute).not.toContain("searchV2({");
  });
});
