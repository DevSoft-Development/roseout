import fs from "node:fs";
import path from "node:path";

describe("website generator upstream fallback contract", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "app/api/business/website/generate/route.ts"),
    "utf8",
  );

  it("falls back to deterministic generation on transient assistant failures", () => {
    expect(source).toContain("transientAssistantFailure");
    expect(source).toContain("assistant_upstream_unavailable");
    expect(source).toContain('fallback_reason: "ai_upstream_unavailable"');
    expect(source).toContain('source: "rules"');
    expect(source).toContain('degraded: true');
  });

  it("does not turn arbitrary persistence errors into silent fallbacks", () => {
    expect(source).toContain("const shouldFallback = transientAssistantFailure(error)");
    expect(source).toContain("if (shouldFallback)");
    expect(source).toContain("Website V3 deterministic fallback failed");
  });
});
