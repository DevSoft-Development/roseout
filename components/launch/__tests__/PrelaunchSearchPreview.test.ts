import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPreview } from "../PrelaunchSearchPreview";

const source = readFileSync("components/launch/PrelaunchSearchPreview.tsx", "utf8");

describe("PrelaunchSearchPreview", () => {
  it("keeps Try it on the homepage with non-wrapping button styling", () => {
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain('action="#homepage-preview"');
    expect(source).not.toContain('href="/create"');
    expect(source).not.toContain("href='/create'");
    expect(source).toContain("whitespace-nowrap");
    expect(source).toContain("shrink-0");
    expect(source).toContain("min-w-[10rem]");
  });

  it("renders the approved two-column results grid", () => {
    expect(source).toContain("grid grid-cols-1 gap-4 xl:grid-cols-2");
    expect(source).not.toContain('className="space-y-5">{items.map');
  });

  it("renders a compact parent pair card with two equal location panels", () => {
    expect(source).toContain("flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[.025]");
    expect(source).toContain("relative grid flex-1 grid-cols-2 items-start");
    expect(source).toContain('data-testid={`prelaunch-${label.toLowerCase()}-panel`}');
    expect(source).toContain('side === "left" ? "border-r border-white/10"');
  });

  it("keeps restaurant and activity images in matching 16:9 frames", () => {
    expect(source).toContain("aspect-[16/9] w-full overflow-hidden rounded-xl");
    expect(source).toContain("h-full w-full object-cover");
    expect(source).toContain("label.toUpperCase()");
  });

  it("uses compact metadata spacing without bottom-pushed ratings", () => {
    expect(source).toContain("<h5 className=\"mt-3");
    expect(source).toContain("<p className=\"mt-1 text-sm text-white/55\"");
    expect(source).toContain("<p className=\"mt-1.5 text-sm\"");
    expect(source).not.toContain("mt-auto");
    expect(source).not.toContain("justify-between");
    expect(source).not.toContain("min-h-[25rem]");
    expect(source).not.toContain("min-h-44");
  });

  it("renders decorative walking connector without affecting layout", () => {
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("pointer-events-none absolute left-1/2");
    expect(source).toContain("bg-[#e1062a]");
  });

  it("does not expose forbidden preview CTAs or links", () => {
    for (const forbidden of ["Reserve", "Directions", "Website", "Save", "Share", "Build this outing", "See all results", "Details"]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("covers loading, empty, and error states inside the preview", () => {
    expect(source).toContain('status === "loading"');
    expect(source).toContain('status === "empty"');
    expect(source).toContain('status === "error"');
    expect(source).toContain("Try another neighborhood, cuisine, or activity");
    expect(source).toContain('aria-live="polite"');
  });

  it("uses abort controllers and request ids so stale responses cannot overwrite newer results", () => {
    expect(source).toContain("AbortController");
    expect(source).toContain("abortRef.current?.abort()");
    expect(source).toContain("requestId !== requestIdRef.current");
    expect(source).toContain("signal: controller.signal");
  });

  it("prefers API pairs, renders a maximum of four, and preserves both location images", () => {
    const preview = buildPreview({
      pairs: [0, 1, 2, 3, 4].map((index) => ({
        pair_title: `Pair ${index}`,
        restaurant: { name: `Restaurant ${index}`, image_url: `/restaurant-${index}.jpg` },
        activity: { name: `Activity ${index}`, image_url: `/activity-${index}.jpg` },
      })),
      restaurants: [{ name: "Ignored restaurant" }],
    });
    expect(preview).toHaveLength(4);
    expect(preview.every((item) => item.kind === "pair")).toBe(true);
    expect(preview[0].parts.map((part) => part.name)).toEqual(["Restaurant 0", "Activity 0"]);
  });
});
