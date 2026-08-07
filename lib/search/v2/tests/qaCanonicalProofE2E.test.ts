import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public Search Health QA canonical proof", () => {
  it("keeps public V2 responses authoritative for retrieval telemetry", () => {
    const responseBuilder = read("lib/search/v2/response/buildPublicSearchResponse.ts");
    expect(responseBuilder).toContain("retrieval: { ...trace.retrieval }");
  });

  it("exports canonical configuration and served-source proof for every QA row", () => {
    const qaRoute = read("app/api/admin/search-health/batch-run/route.ts");
    for (const field of [
      "configuredMode",
      "configuredPercent",
      "servedSource",
      "legacyFallbackUsed",
      "fallbackDomains",
      "canonicalProofPassed",
      "canonicalProfileContract",
    ]) {
      expect(qaRoute).toContain(field);
    }
  });

  it("fails QA when canonical primary or served-source proof drifts", () => {
    const qaRoute = read("app/api/admin/search-health/batch-run/route.ts");
    expect(qaRoute).toContain('configuredMode === "primary"');
    expect(qaRoute).toContain("configuredPercent === 100");
    expect(qaRoute).toContain('servedSource === "canonical_profile"');
    expect(qaRoute).toContain("canonical_config_drift");
    expect(qaRoute).toContain("canonical_serving_unproven");
    expect(qaRoute).toContain("acceptance.testPassed && canonicalProofPassed");
  });

  it("continues to execute through the exact public controller path", () => {
    const qaRoute = read("app/api/admin/search-health/batch-run/route.ts");
    expect(qaRoute).toContain(
      'import { createPublicSearchController } from "@/lib/search/public-api/controller"',
    );
    expect(qaRoute).toContain('new Request("http://internal/api/generate"');
    expect(qaRoute).toContain('executionPath: "/api/generate"');
  });
});
