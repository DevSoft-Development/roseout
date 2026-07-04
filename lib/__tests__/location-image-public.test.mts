import { describe, expect, it } from "vitest";

import { getLocationImage, firstImage } from "@/lib/locationImage";
import {
  dedupeLocationPhotos,
  getBestPublicLocationImageFromRecord,
} from "@/lib/locations/photo-public";

describe("client-safe location image helpers", () => {
  it("delegates best image selection to the public photo helper", () => {
    const location = {
      main_image: "https://example.com/main.jpg",
      images: ["https://example.com/other.jpg"],
    };

    expect(getLocationImage(location)).toBe(
      getBestPublicLocationImageFromRecord(location),
    );
  });

  it("returns a single best image for one-photo input", () => {
    expect(firstImage(["https://example.com/photo.jpg"])).toBe(
      "https://example.com/photo.jpg",
    );
  });

  it("dedupes duplicate public photo URLs consistently", () => {
    expect(
      dedupeLocationPhotos([
        "http://example.com/photo.jpg?width=400",
        "https://example.com/photo.jpg?width=800",
      ]),
    ).toEqual(["https://example.com/photo.jpg?width=400"]);
  });
});
