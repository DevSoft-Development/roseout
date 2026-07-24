import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPreview } from "../PrelaunchSearchPreview";

const source = readFileSync("components/launch/PrelaunchSearchPreview.tsx", "utf8");

describe("PrelaunchSearchPreview", () => {
  it("keeps Try it on the homepage with non-wrapping button styling", () => {
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('action="#homepage-preview"');
    expect(source).not.toContain('href="/create"');
    expect(source).not.toContain("href='/create'");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("shrink-0");
    expect(source).toContain("min-w-[10rem]");
  });

  it("renders approved read-only paired geometry", () => {
    expect(source).toContain("grid grid-cols-1 items-stretch md:grid-cols-2");
    expect(source).toContain("aspect-[16/10] w-full overflow-hidden");
    expect(source).toContain("absolute inset-y-0 left-1/2 hidden border-l border-white/10 md:block");
    expect(source).toContain("md:flex");
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("Restaurant");
    expect(source).toContain("Activity");
  });

  it("does not expose forbidden preview CTAs or links", () => {
    for (const forbidden of ["Reserve", "Directions", "Website", "Save", "Share", "Build this outing", "See all results"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("covers loading, empty, and error states inside the preview", () => {
    expect(source).toContain('status === "loading"');
    expect(source).toContain('status === "empty"');
    expect(source).toContain('status === "error"');
    expect(source).toContain("Try another neighborhood, cuisine, or activity");
  });

  it("uses abort controllers and request ids so stale responses cannot overwrite newer results", () => {
    expect(source).toContain("AbortController");
    expect(source).toContain("abortRef.current?.abort()");
    expect(source).toContain("requestId !== requestIdRef.current");
    expect(source).toContain("signal: controller.signal");
  });

  it("prefers API pairs, renders a maximum of three, and preserves both location images", () => {
    const preview = buildPreview({
      pairs: [0, 1, 2, 3].map((index) => ({
        pair_title: `Pair ${index}`,
        restaurant: { name: `Restaurant ${index}`, image_url: `/restaurant-${index}.jpg` },
        activity: { name: `Activity ${index}`, image_url: `/activity-${index}.jpg` },
      })),
      restaurants: [{ name: "Ignored restaurant" }],
    });
    expect(preview).toHaveLength(3);
    expect(preview.every((item) => item.kind === "pair")).toBe(true);
    expect(preview[0].parts.map((part) => part.name)).toEqual(["Restaurant 0", "Activity 0"]);
  });
});
