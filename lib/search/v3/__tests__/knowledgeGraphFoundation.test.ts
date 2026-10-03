import { describe, expect, it } from "vitest";
import { normalizeAlias } from "@/lib/search/v3/theouthaven-adapters/supabaseKnowledgeGraphProvider";

describe("Search V3 knowledge graph foundation", () => {
  it("normalizes aliases consistently for landmark and venue lookup", () => {
    expect(normalizeAlias("  Madison Square Garden  ")).toBe("madison square garden");
    expect(normalizeAlias("Joe's Pizza — Midtown")).toBe("joe s pizza midtown");
  });
});
