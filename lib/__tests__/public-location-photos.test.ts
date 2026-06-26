import { describe, expect, it } from "vitest";
import { getPhotoList } from "@/lib/publicLocationPhotos";

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
});
