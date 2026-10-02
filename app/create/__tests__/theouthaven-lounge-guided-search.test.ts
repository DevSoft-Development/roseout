import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isInternalDemoRole } from "@/lib/demo/internal-demo-access";

const createPage = readFileSync("app/create/page.tsx", "utf8");
const loungeResult = readFileSync(
  "app/create/TheOutHavenLoungeSearchResult.tsx",
  "utf8",
);

describe("TheOutHaven Lounge guided search", () => {
  it("routes the current guided /create prompt into the protected Lounge result", () => {
    expect(createPage).toContain("isTheOutHavenLoungePrompt");
    expect(createPage).toContain("getInternalDemoViewer");
    expect(createPage).toContain(
      '<TheOutHavenLoungeSearchResult query="TheOutHaven Lounge" />',
    );
  });

  it("runs through the protected search API before preparing the fixture", () => {
    expect(loungeResult).toContain('fetch("/api/generate"');
    expect(loungeResult).toContain("internal_demo_search");
    expect(loungeResult).toContain(
      'fetch("/api/admin/demo/theouthaven-lounge"',
    );
  });

  it("exposes the real end-to-end location surfaces including the Location Dashboard", () => {
    expect(loungeResult).toContain("location.publicViewHref");
    expect(loungeResult).toContain("location.reservationHref");
    expect(loungeResult).toContain("location.checkInHref");
    expect(loungeResult).toContain("location.feedbackHref");
    expect(loungeResult).toContain("location.locationDashboardHref");
    expect(loungeResult).toContain("Open Location Dashboard");
  });

  it("remains limited to the existing approved internal demo roles", () => {
    expect(isInternalDemoRole("superadmin")).toBe(true);
    expect(isInternalDemoRole("admin")).toBe(true);
    expect(isInternalDemoRole("ambassador")).toBe(true);
    expect(isInternalDemoRole("support")).toBe(true);
    expect(isInternalDemoRole("user")).toBe(false);
    expect(isInternalDemoRole("owner")).toBe(false);
    expect(isInternalDemoRole("viewer")).toBe(false);
  });
});
