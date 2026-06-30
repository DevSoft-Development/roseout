import { describe, expect, it } from "vitest";
import { buildAssignmentPayload, isInvalidUuidInput, isUuid, normalizeResource, reservationConflictsWithResource, shouldPersistBookableItemId } from "@/app/api/reserve/portal/assign-resource/route";

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

  it("does not persist layout item UUIDs as bookable item ids", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(isUuid(id)).toBe(true);
    const resource = { id, source: "layout_items" as const, label: "Patio 4", type: "patio", capacity: 2 };
    expect(shouldPersistBookableItemId(resource)).toBe(false);
    expect(buildAssignmentPayload(resource, false)).toEqual({
      bookable_item_id: null,
      bookable_item_name: "Patio 4",
      bookable_item_type: "patio",
    });
  });

  it("persists location_bookable_items UUIDs as bookable item ids", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const resource = { id, source: "location_bookable_items" as const, label: "Patio 4", type: "patio", capacity: 2 };
    expect(shouldPersistBookableItemId(resource)).toBe(true);
    expect(buildAssignmentPayload(resource, false)).toEqual({
      bookable_item_id: id,
      bookable_item_name: "Patio 4",
      bookable_item_type: "patio",
    });
  });

  it("checks layout conflicts by label instead of layout item id", () => {
    const requested = { reservation_time: "18:00", duration_minutes: 90 };
    const layoutResource = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      source: "layout_items" as const,
      label: "Demo Table",
      type: "table",
      capacity: 4,
    };
    expect(reservationConflictsWithResource(requested, { reservation_time: "18:30", duration_minutes: 60, bookable_item_id: layoutResource.id, bookable_item_name: "Other Table" }, layoutResource)).toBe(false);
    expect(reservationConflictsWithResource(requested, { reservation_time: "18:30", duration_minutes: 60, bookable_item_id: null, bookable_item_name: " demo   table " }, layoutResource)).toBe(true);
  });

  it("defaults assignment type to table for label-only safety", () => {
    expect(buildAssignmentPayload({ id: "demo-table", source: "manual_label", label: "Demo Table", type: null, capacity: 4 }, false)).toEqual({
      bookable_item_id: null,
      bookable_item_name: "Demo Table",
      bookable_item_type: "table",
    });
  });

  it("detects invalid UUID update errors for label-only retry", () => {
    expect(isInvalidUuidInput({ code: "22P02" })).toBe(true);
    expect(isInvalidUuidInput({ message: 'invalid input syntax for type uuid: "table-1"' })).toBe(true);
  });
});
