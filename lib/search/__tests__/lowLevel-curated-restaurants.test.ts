import { describe, expect, it } from "vitest";
import { isLowLevelLocation } from "@/lib/search/lowLevel";

const curatedRestaurant = {
  location_type: "restaurant",
  rating: 4.7,
  review_count: 300,
  has_photos: true,
  photo_status: "storage_cached",
  main_image: "https://example.supabase.co/storage/v1/object/public/location-images/example.jpg",
  curation_tier: "curated",
  public_visibility_tier: "standard",
  source_quality_status: "curated_google",
  import_confidence: "high",
  tags: ["restaurant", "dine in", "takeout", "delivery"],
  search_keywords: ["restaurant", "dine in", "takeout", "delivery"],
};

describe("low-level classification for curated restaurants", () => {
  it("does not hide a strong dine-in restaurant merely because it offers takeout", () => {
    expect(isLowLevelLocation(curatedRestaurant)).toBe(false);
  });

  it("still hides a deli even when it is otherwise curated and offers dine-in", () => {
    expect(
      isLowLevelLocation({
        ...curatedRestaurant,
        name: "Neighborhood Deli",
        tags: [...curatedRestaurant.tags, "deli"],
      }),
    ).toBe(true);
  });

  it("still respects explicit low-level flags", () => {
    expect(isLowLevelLocation({ ...curatedRestaurant, is_low_level: true })).toBe(true);
  });
});
