import { describe, expect, it } from "vitest";
import { mergeLayoutResources } from "@/app/api/reserve/portal/layout/route";
import {
  byResourceKey,
  normalizeResource,
} from "@/app/api/reserve/portal/resources/route";

describe("Reserve layout resource normalization", () => {
  it("uses layout_items as the only floor-layout source and ignores legacy rows", () => {
    const resources = mergeLayoutResources(
      [
        {
          id: "layout-bar",
          location_id: "loc",
          source_table: "restaurant",
          item_name: "Main Bar",
          item_type: "bar",
          capacity: 10,
        },
        {
          id: "layout-table",
          location_id: "loc",
          source_table: "locations",
          item_name: "Table 1",
          item_type: "table",
          capacity: 2,
        },
      ],
      [
        {
          id: "legacy-bar",
          location_id: "loc",
          location_type: "restaurant",
          item_name: "Main Bar",
          item_type: "bar_seat",
          capacity_min: 1,
          capacity_max: 10,
        },
        {
          id: "legacy-only",
          location_id: "loc",
          location_type: "restaurant",
          item_name: "Legacy Only",
          item_type: "table",
          capacity_min: 2,
          capacity_max: 2,
        },
      ],
    );

    expect(resources.map((resource) => resource.id)).toEqual([
      "layout-bar",
      "layout-table",
    ]);
    expect(resources.every((resource) => resource.resource_source === "layout_items")).toBe(true);
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
