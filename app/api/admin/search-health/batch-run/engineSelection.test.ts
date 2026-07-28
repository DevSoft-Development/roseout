import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/search-health/batch-run/route.ts"),
  "utf8",
);
const selectorSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "app/admin/dashboard/beta/search-lab/SearchLabClient.tsx",
  ),
  "utf8",
);

describe("Search Health QA engine selection", () => {
  it("supports legacy, v2, and compare in the existing batch runner endpoint", () => {
    expect(routeSource).toContain('["legacy", "v2", "compare"]');
    expect(routeSource).toContain('request.cookies.get("search_qa_engine")');
    expect(routeSource).toContain('searchCoreOverride: override');
  });

  it("runs both engines and retains both full responses in compare mode", () => {
    expect(routeSource).toContain('run(query, "legacy"');
    expect(routeSource).toContain('run(query, "v2"');
    expect(routeSource).toContain("comparisonMode: true");
    expect(routeSource).toContain("legacy,");
    expect(routeSource).toContain("v2,");
  });

  it("replaces the standalone search form with an engine selector", () => {
    expect(selectorSource).toContain("Choose the engine for both QA search fields");
    expect(selectorSource).toContain("Single Search QA and Batch Search QA");
    expect(selectorSource).not.toContain("Run one prompt");
    expect(selectorSource).not.toContain("One prompt per line");
  });
});
