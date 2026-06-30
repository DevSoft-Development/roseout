import { describe, expect, it } from "vitest";
import { mergeLayoutResources } from "@/app/api/reserve/portal/layout/route";
import {
  byResourceKey,
  normalizeResource,
} from "@/app/api/reserve/portal/resources/route";

describe("Reserve layout resource normalization", () => {
  it("merges layout_items across source_table variants with legacy items and prefers layout duplicates", () => {
    const resources = mergeLayoutResources(
      [
        {
          id: "layout-restaurant",
          location_id: "loc",
          source_table: "restaurant",
          item_name: "Table 1",
          item_type: "table",
          capacity: 2,
        },
        {
          id: "layout-location",
          location_id: "loc",
          source_table: "locations",
          item_name: "Patio",
          item_type: "table",
          capacity: 4,
        },
        {
          id: "layout-dupe",
          location_id: "loc",
          source_table: "locations",
          item_name: "Legacy Booth",
          item_type: "booth",
          capacity: 4,
        },
      ],
      [
        {
          id: "legacy-dupe",
          location_id: "loc",
          location_type: "restaurant",
          item_name: "Legacy Booth",
          item_type: "booth",
          capacity_min: 4,
          capacity_max: 4,
        },
      ],
    );

    expect(resources.map((resource) => resource.id)).toEqual(
      expect.arrayContaining([
        "layout-restaurant",
        "layout-location",
        "layout-dupe",
      ]),
    );
    expect(resources.map((resource) => resource.id)).not.toContain(
      "legacy-dupe",
    );
  });

  it("maps x_position and y_position to layout coordinates", () => {
    expect(
      normalizeResource({
        id: "layout-1",
        item_name: "Table 1",
        x_position: 32,
        y_position: 48,
        width: 100,
        height: 80,
      }),
    ).toMatchObject({
      layout_x: 32,
      layout_y: 48,
      layout_width: 100,
      layout_height: 80,
    });
  });

  it("dedupes resources without letting rpc-only resources replace open fallback resources", () => {
    const merged = byResourceKey([
      normalizeResource(
        {
          id: "rpc-occupied",
          item_name: "Table 1",
          item_type: "table",
          capacity: 2,
        },
        "reserve_live_layout_status",
      ),
      normalizeResource(
        {
          id: "layout-open",
          item_name: "Table 2",
          item_type: "table",
          capacity: 4,
        },
        "layout_items",
      ),
    ]);
    expect(merged.map((resource) => resource.item_name)).toEqual([
      "Table 1",
      "Table 2",
    ]);
  });
});
