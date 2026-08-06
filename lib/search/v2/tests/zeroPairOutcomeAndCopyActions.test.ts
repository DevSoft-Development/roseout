import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(file: string) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

describe("V2 zero-pair truth and QA copy actions", () => {
  it("keeps the public adapter truthful when a mixed request has no rendered pair", () => {
    const adapter = source("lib/search/v2/response/compatibilityAdapter.ts");
    expect(adapter).toContain("const noCompatiblePair");
    expect(adapter).toContain('"no_compatible_pair"');
    expect(adapter).toContain('requestFulfilled: truthfulRequestFulfilled');
    expect(adapter).toContain('partialResults: truthfulPartialResults');
    expect(adapter).toContain('"partial_mixed"');
    expect(adapter).toContain("outcome: terminalOutcome");
  });

  it("renders real clipboard actions for both QA JSON payloads", () => {
    const runner = source("app/admin/dashboard/search-health/BatchQaRunner.tsx");
    expect(runner).toContain("navigator.clipboard");
    expect(runner).toContain("Copy Summary JSON");
    expect(runner).toContain("Copy Full Batch JSON");
    expect(runner).toContain('handleCopy(rows, "Summary JSON")');
    expect(runner).toContain('handleCopy(batchResult, "Full Batch JSON")');
  });

  it("normalizes row ok status to the quality-contract result", () => {
    const runner = source("app/admin/dashboard/search-health/BatchQaRunner.tsx");
    expect(runner).toContain("ok: testPassed");
    expect(runner).toContain("combined.ok = combined.summary.every");
  });
});
