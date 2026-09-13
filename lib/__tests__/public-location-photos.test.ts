import { describe, expect, it } from "vitest";
import { getLazyGooglePhotoSlots, getPhotoList, getPrimaryPhoto } from "@/lib/publicLocationPhotos";

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

  it("builds one primary plus four lazy Google gallery slots", () => {
    const location = { google_place_id: "ChIJ-test-place" };
    const photos = getPhotoList(location);
    const lazyPhotos = getLazyGooglePhotoSlots(location);

    expect(photos).toHaveLength(5);
    expect(photos[0]).toContain("placeId=ChIJ-test-place");
    expect(photos[0]).toContain("index=0");
    expect(photos[4]).toContain("index=4");
    expect(lazyPhotos).toHaveLength(4);
    expect(lazyPhotos[0]).toContain("index=1");
    expect(lazyPhotos[3]).toContain("index=4");
  });

  it("keeps a persisted Google snapshot ahead of live Google fallback slots", () => {
    const stored = "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/migrated-google-123.jpg";
    const photos = getPhotoList({
      google_place_id: "ChIJ-live-google",
      photo_source: "google_places",
      main_image: stored,
      image_url: stored,
      images: [stored],
    });

    expect(photos).toHaveLength(5);
    expect(photos[0]).toBe(stored);
    expect(photos[1]).toContain("placeId=ChIJ-live-google");
    expect(photos[1]).toContain("index=1");
  });

  it("keeps existing photos first and fills only their missing Google positions", () => {
    const location = {
      google_place_id: "ChIJ-owner-place",
      owner_primary_photo_url: "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
      owner_photo_urls: [
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/interior.jpg",
        "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/food.jpg",
      ],
    };
    const photos = getPhotoList(location);
    const lazyPhotos = getLazyGooglePhotoSlots(location, 5, 3);

    expect(photos).toHaveLength(5);
    expect(photos.slice(0, 3)).toEqual([
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/hero.jpg",
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/interior.jpg",
      "https://project.supabase.co/storage/v1/object/public/location-images/locations/1/food.jpg",
    ]);
    expect(photos[3]).toContain("index=3");
    expect(photos[4]).toContain("index=4");
    expect(lazyPhotos).toHaveLength(2);
    expect(lazyPhotos[0]).toContain("index=3");
    expect(lazyPhotos[1]).toContain("index=4");
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
    const location = {
      google_place_id: "ChIJ-full-owner-gallery",
      owner_primary_photo_url: ownerPhotos[0],
      owner_photo_urls: ownerPhotos,
    };
    const photos = getPhotoList(location);
    const lazyPhotos = getLazyGooglePhotoSlots(location, 5, photos.length);

    expect(photos).toEqual(ownerPhotos);
    expect(photos.some((url) => url.includes("google-place-photo"))).toBe(false);
    expect(lazyPhotos).toEqual([]);
  });
});
