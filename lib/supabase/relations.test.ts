import { describe, expect, it } from "vitest";
import { normalizeManyRelation, normalizeSingleRelation } from "./relations";

describe("Supabase relation normalization", () => {
  it("normalizes missing, object, and readonly array to-one relations", () => {
    const values = Object.freeze([{ id: "first" }, { id: "second" }]);
    expect(normalizeSingleRelation(undefined)).toBeNull();
    expect(normalizeSingleRelation({ id: "only" })).toEqual({ id: "only" });
    expect(normalizeSingleRelation(values)).toEqual({ id: "first" });
  });

  it("normalizes to-many relations to a mutable copy", () => {
    const values = Object.freeze([{ id: "first" }]);
    const normalized = normalizeManyRelation(values);
    expect(normalized).toEqual(values);
    expect(normalized).not.toBe(values);
    expect(normalizeManyRelation({ id: "only" })).toEqual([{ id: "only" }]);
    expect(normalizeManyRelation(null)).toEqual([]);
  });
});
