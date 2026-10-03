import { describe, expect, it } from "vitest";
import {
  entityTextSimilarity,
  normalizeEntityText,
} from "@/lib/search-framework/entity-resolution/normalizeEntityText";

describe("Search V3 entity normalization", () => {
  it("expands common landmark shorthand", () => {
    expect(normalizeEntityText("MSG")).toBe("madison square garden");
    expect(normalizeEntityText("MoMA")).toBe("museum of modern art");
    expect(normalizeEntityText("JFK")).toBe("john f kennedy international airport");
    expect(normalizeEntityText("CitiField")).toBe("citi field");
  });

  it("normalizes punctuation and business suffixes", () => {
    expect(normalizeEntityText("The Joe's Pizza, LLC")).toBe("joes pizza");
  });

  it("scores containment and token overlap deterministically", () => {
    expect(entityTextSimilarity("madison square garden", "madison square garden")).toBe(1);
    expect(entityTextSimilarity("madison square garden", "square garden")).toBe(0.86);
  });
});
