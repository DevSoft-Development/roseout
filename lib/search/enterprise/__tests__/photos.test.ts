import { describe, expect, it } from "vitest";
import { firstSearchImage, hasUsableSearchPhoto, primarySearchCardImage } from "../photos";

describe("enterprise search photo helpers", () => {
  it("accepts photo_url records", () => {
    expect(
      hasUsableSearchPhoto({
        id: "1",
        name: "Long Island Hookah Lounge",
        photo_url: "https://example.com/photo.jpg",
      } as any),
    ).toBe(true);
  });

  it("accepts primary_photo_url records", () => {
    expect(
      hasUsableSearchPhoto({
        id: "2",
        name: "Long Island Lounge",
        primary_photo_url: "https://example.com/primary.jpg",
      } as any),
    ).toBe(true);
  });

  it("accepts nested photo objects", () => {
    expect(firstSearchImage([{ url: "https://example.com/nested.jpg" }])).toBe(
      "https://example.com/nested.jpg",
    );
  });

  it("selects just one primary image, without returning the gallery", () => {
    expect(primarySearchCardImage({main_image:"https://example.com/cover.jpg", images:["https://example.com/gallery1.jpg","https://example.com/gallery2.jpg"]} as any))
      .toBe("https://example.com/cover.jpg");
    expect(primarySearchCardImage({images:["https://example.com/first.jpg","https://example.com/second.jpg"]} as any))
      .toBe("https://example.com/first.jpg");
  });

  it("rejects placeholders", () => {
    expect(
      hasUsableSearchPhoto({
        id: "3",
        name: "Bad Photo",
        image_url: "placeholder",
      } as any),
    ).toBe(false);
  });
});
