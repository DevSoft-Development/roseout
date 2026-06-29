import { describe, expect, it } from "vitest";
import { buildAssignmentPayload, isInvalidUuidInput, isUuid, normalizeResource } from "@/app/api/reserve/portal/assign-resource/route";

describe("assign resource route helpers", () => {
  it("normalizes layout item names without requiring a label column", () => {
    expect(normalizeResource({ id: "layout-id", item_name: "Table 3", item_type: "table", capacity: 4 }, "layout_items")).toEqual({
      id: "layout-id",
      source: "layout_items",
      label: "Table 3",
      type: "table",
      capacity: 4,
    });
  });

  it("uses null bookable_item_id for non-UUID resource ids", () => {
    expect(buildAssignmentPayload({ id: "layout-table-1", source: "manual_label", label: "Table 1", type: "table", capacity: 4 }, false)).toEqual({
      bookable_item_id: null,
      bookable_item_name: "Table 1",
      bookable_item_type: "table",
    });
  });

  it("uses UUID bookable_item_id for UUID resource ids", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(isUuid(id)).toBe(true);
    expect(buildAssignmentPayload({ id, source: "layout_items", label: "Patio 4", type: "patio", capacity: 2 }, false)).toEqual({
      bookable_item_id: id,
      bookable_item_name: "Patio 4",
      bookable_item_type: "patio",
    });
  });

  it("detects invalid UUID update errors for label-only retry", () => {
    expect(isInvalidUuidInput({ code: "22P02" })).toBe(true);
    expect(isInvalidUuidInput({ message: 'invalid input syntax for type uuid: "table-1"' })).toBe(true);
  });
});
