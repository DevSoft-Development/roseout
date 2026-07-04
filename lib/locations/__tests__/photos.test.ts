import { describe, expect, it } from "vitest";
import {
  dedupeLocationPhotos,
  getBestLocationImage,
  getLocationPhotoGallery,
  getMissingPhotoStatusFromRecord,
  getPublicLocationPhotosFromRecord,
  normalizeLocationPhotoList,
} from "@/lib/locations/photo-public";

describe("canonical location photo service", () => {
  it("dedupes duplicate URLs and Google photo references", () => {
    const photos = dedupeLocationPhotos(normalizeLocationPhotoList([
      "HTTP://cdn.example.com/location/photo.jpg/",
      "https://cdn.example.com/location/photo.jpg",
      "https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=same_ref&key=secret",
      "/api/public/google-place-photo?ref=same_ref&maxwidth=800",
    ]));

    expect(photos.map((photo) => photo.url)).toEqual([
      "https://cdn.example.com/location/photo.jpg/",
      "/api/public/google-place-photo?ref=same_ref&maxwidth=1200",
    ]);
  });

  it("selects explicit uploaded primary photos before gallery or Google photos", () => {
    const best = getBestLocationImage({
      main_image: "https://cdn.example.com/uploaded-primary.jpg",
      images: ["https://cdn.example.com/gallery.jpg"],
      google_photo_url: "https://maps.googleapis.com/maps/api/place/photo?photo_reference=google_ref&key=secret",
    });

    expect(best).toBe("https://cdn.example.com/uploaded-primary.jpg");
  });

  it("falls back to cached or proxied Google photos when no upload exists", () => {
    const best = getBestLocationImage({ google_photo_url: "https://maps.googleapis.com/maps/api/place/photo?photo_reference=google_ref&key=secret" });
    expect(best).toBe("/api/public/google-place-photo?ref=google_ref&maxwidth=1200");
  });

  it("falls back safely when no photo exists", () => {
    expect(getBestLocationImage({}, { includeFallback: true })).toBe("/toh_logo.png");
    expect(getMissingPhotoStatusFromRecord({ id: "loc_1" })).toMatchObject({ hasPublicPhoto: false, status: "missing_photo", photoCount: 0 });
  });

  it("does not repeat hero image in gallery when requested", () => {
    const location = { main_image: "https://cdn.example.com/one.jpg", images: ["https://cdn.example.com/one.jpg", "https://cdn.example.com/two.jpg"] };
    expect(getPublicLocationPhotosFromRecord(location)).toHaveLength(2);
    expect(getLocationPhotoGallery(location, { excludeHero: true }).map((photo) => photo.url)).toEqual(["https://cdn.example.com/two.jpg"]);
  });

  it("missing-photo status matches public photo availability", () => {
    expect(getMissingPhotoStatusFromRecord({ image_url: "https://cdn.example.com/ok.jpg" })).toMatchObject({ hasPublicPhoto: true, status: "has_photo", photoCount: 1 });
  });
});
