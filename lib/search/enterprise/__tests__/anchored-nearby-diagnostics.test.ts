import { describe, expect, it } from "vitest";
import { runAnchoredNearbySearch } from "../anchoredNearby";

function createSearchSupabase() {
  let locationQuery = 0;
  const anchorLocation = {
    id: "anchor-id",
    name: "Gaming City",
    location_type: "activity",
    activity_type: "arcade",
    primary_category: "arcade",
    city: "Astoria",
    borough: "Queens",
    state: "NY",
    latitude: 40.7562,
    longitude: -73.9302,
    active: true,
    is_searchable: true,
    is_hidden: false,
    deleted_at: null,
    status: "approved",
  };
  const restaurant = {
    id: "restaurant-id",
    name: "Nearby Restaurant",
    restaurant_name: "Nearby Restaurant",
    location_type: "restaurant",
    primary_category: "restaurant",
    city: "Astoria",
    borough: "Queens",
    state: "NY",
    latitude: 40.757,
    longitude: -73.931,
    rating: 4.6,
    review_count: 500,
    quality_score: 90,
    active: true,
    is_searchable: true,
    is_hidden: false,
    deleted_at: null,
    status: "approved",
  };
  const rejectedActivity = {
    ...restaurant,
    id: "activity-id",
    name: "Nearby Arcade",
    restaurant_name: null,
    location_type: "activity",
    activity_type: "arcade",
    primary_category: "arcade",
  };

  return {
    from(table: string) {
      const builder: any = {};
      for (const method of ["select", "eq", "or", "is", "not", "gte", "lte"]) {
        builder[method] = () => builder;
      }
      builder.limit = () => {
        if (table === "search_anchors") {
          return Promise.resolve({
            data: [{
              id: "registry-id",
              canonical_name: "Gaming City",
              normalized_name: "gaming city",
              linked_location_id: "anchor-id",
              source_type: "linked_location",
              anchor_type: "entertainment_venue",
              is_active: true,
              is_searchable: true,
              review_status: "approved",
              city: "Astoria",
              borough: "Queens",
              state: "NY",
              latitude: 40.7562,
              longitude: -73.9302,
            }],
            error: null,
          });
        }
        locationQuery += 1;
        return Promise.resolve({
          data: locationQuery === 1
            ? [anchorLocation]
            : [anchorLocation, restaurant, rejectedActivity],
          error: null,
        });
      };
      return builder;
    },
  };
}

describe("anchored nearby diagnostics", () => {
  it("reports applied anchor distances and rejected-domain candidates", async () => {
    const result: any = await runAnchoredNearbySearch({
      query: "Restaurant near Gaming City in Astoria",
      supabase: createSearchSupabase(),
      displayLimit: 10,
    });

    expect(result.success).toBe(true);
    expect(result.debug.anchorDistanceApplied).toBe(true);
    expect(result.debug.anchorDomainRejectedCount).toBeGreaterThanOrEqual(1);
    expect(result.debug.anchorResultPreview).toEqual([
      expect.objectContaining({
        id: "restaurant-id",
        distanceMiles: expect.any(Number),
        walkingMinutes: expect.any(Number),
        rankScore: expect.any(Number),
      }),
    ]);
  });
});
