import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("website preview artifact contract", () => {
  it("accepts renderer HTML when encoding is omitted by the renderer contract", () => {
    const preview = source("app/api/business/website/preview/route.ts");
    const contract = source("lib/websites/publish-contract.ts");

    expect(contract).toContain('encoding?: "utf8"');
    expect(preview).toContain('index.encoding && index.encoding !== "utf8"');
    expect(preview).not.toContain('index.encoding !== "utf8") return');
  });
});
