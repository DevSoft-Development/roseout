import { describe, expect, it } from "vitest";
import { normalizeResource } from "@/app/api/reserve/portal/assign-resource/route";

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
});
