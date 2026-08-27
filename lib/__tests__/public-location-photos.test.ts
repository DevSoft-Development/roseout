import { describe, expect, it } from "vitest";
import { getPhotoList, getPrimaryPhoto } from "@/lib/publicLocationPhotos";

describe("public location photo dedupe", () => {
  it("counts a raw Google Places photo URL and matching public proxy URL as one photo", () => {
    const photos = getPhotoList({
      main_image: "https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=same_ref&key=secret",
      image_url: "/api/public/google-place-photo?ref=same_ref&maxwidth=800",
    });

    expect(photos).toHaveLength(1);
  });

  it("counts matching main_image and image_url URLs as one photo", () => {
    const photos = getPhotoList({
      main_image: "HTTP://cdn.example.com/location/photo.jpg/",
      image_url: "https://cdn.example.com/location/photo.jpg",
    });

    expect(photos).toHaveLength(1);
  });

  it("counts one main image plus one different gallery image as two photos", () => {
    const photos = getPhotoList({
      main_image: "https://cdn.example.com/location/main.jpg",
      gallery_images: ["https://cdn.example.com/location/gallery.jpg"],
    });

    expect(photos).toHaveLength(2);
  });

  it("builds five distinct Google fallback slots when a location has no owned imagery", () => {
    const photos = getPhotoList({ google_place_id: "ChIJ-test-place" });

    expect(photos).toHaveLength(5);
    expect(photos[0]).toContain("placeId=ChIJ-test-place");
    expect(photos[0]).toContain("index=0");
    expect(photos[4]).toContain("index=4");
  });

  it("replaces a legacy persisted Google snapshot with current indexed Google slots", () => {
    const legacy = "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/migrated-google-123.jpg";
    const photos = getPhotoList({
      google_place_id: "ChIJ-live-google",
      photo_source: "google_places",
      main_image: legacy,
      image_url: legacy,
      images: [legacy],
    });

    expect(photos).toHaveLength(5);
    expect(photos).not.toContain(legacy);
    expect(photos.every((url) => url.includes("/api/public/google-place-photo"))).toBe(true);
  });

  it("keeps owner photos first and uses Google only for missing gallery positions", () => {
    const photos = getPhotoList({
      google_place_id: "ChIJ-owner-place",
      owner_primary_photo_url: "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
      owner_photo_urls: [
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/interior.jpg",
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/food.jpg",
      ],
    });

    expect(photos).toHaveLength(5);
    expect(photos.slice(0, 3)).toEqual([
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/interior.jpg",
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/food.jpg",
    ]);
    expect(photos[3]).toContain("/api/public/google-place-photo");
    expect(photos[4]).toContain("/api/public/google-place-photo");
  });

  it("uses an owner-selected cover photo ahead of Google and legacy imagery", () => {
    const ownerHero = "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/owner-hero.jpg";
    const primary = getPrimaryPhoto({
      google_place_id: "ChIJ-owner-primary",
      main_image: "/api/public/google-place-photo?placeId=ChIJ-owner-primary&index=0&maxwidth=1200",
      owner_primary_photo_url: ownerHero,
      owner_photo_urls: [ownerHero],
    });

    expect(primary).toBe(ownerHero);
  });

  it("does not add Google calls when five owner photos already fill the public mosaic", () => {
    const ownerPhotos = Array.from(
      { length: 5 },
      (_, index) => `https://project.supabase.co/storage/v1/object/public/location-images/locations/1/photo-${index}.jpg`,
    );
    const photos = getPhotoList({
      google_place_id: "ChIJ-full-owner-gallery",
      owner_primary_photo_url: ownerPhotos[0],
      owner_photo_urls: ownerPhotos,
    });

    expect(photos).toEqual(ownerPhotos);
    expect(photos.some((url) => url.includes("google-place-photo"))).toBe(false);
  });
});
