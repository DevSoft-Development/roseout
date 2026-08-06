import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/search-health/batch-run/route.ts"),
  "utf8",
);

describe("Search Health QA public-search parity", () => {
  it("uses the same public controller as api generate", () => {
    expect(routeSource).toContain(
      'createPublicSearchController } from "@/lib/search/public-api/controller"',
    );
    expect(routeSource).toContain('new Request("http://internal/api/generate"');
    expect(routeSource).toContain("const response = await controller(request)");
    expect(routeSource).not.toContain("runOutingSearch");
    expect(routeSource).not.toContain("searchCoreOverride");
  });

  it("bypasses only usage and duplicate telemetry for authenticated QA runs", () => {
    expect(routeSource).toContain("checkLimit: async () => ({");
    expect(routeSource).toContain("allowed: true");
    expect(routeSource).toContain("recordUsage: async () => undefined");
    expect(routeSource).toContain("logAnalytics: async () => undefined");
    expect(routeSource).toContain("logSearchHealth: async () => undefined");
  });

  it("evaluates QA contracts after receiving the public payload", () => {
    const publicCall = routeSource.indexOf("await runPublicQaSearch");
    const acceptanceCall = routeSource.indexOf("evaluateSearchAcceptanceContracts");
    expect(publicCall).toBeGreaterThan(-1);
    expect(acceptanceCall).toBeGreaterThan(-1);
    expect(routeSource).toContain('engine: "public"');
    expect(routeSource).toContain('executionPath: "/api/generate"');
    expect(routeSource).toContain("parityMode: true");
  });

  it("keeps the exact public result collections and telemetry in QA output", () => {
    expect(routeSource).toContain("asArray(result?.restaurants).length");
    expect(routeSource).toContain("asArray(result?.activities).length");
    expect(routeSource).toContain("asArray(result?.pairs).length");
    expect(routeSource).toContain("asArray(result?.cards).length");
    expect(routeSource).toContain("rawActivityCandidateCount");
    expect(routeSource).toContain("pairCandidatesEvaluated");
    expect(routeSource).toContain("render_mode");
  });
});
