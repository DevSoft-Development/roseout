import { describe, expect, it } from "vitest";
import {
  LOCATION_INTELLIGENCE_STAGES,
  TERMINAL_STAGE_STATUSES,
  stageAfter,
} from "../lifecycle";

describe("Location Intelligence lifecycle contract", () => {
  it("keeps the canonical stage order stable", () => {
    expect(LOCATION_INTELLIGENCE_STAGES).toEqual([
      "intake",
      "normalize",
      "google_identity",
      "google_details",
      "website",
      "reservations",
      "photos",
      "classification",
      "search_profile",
      "dedupe",
      "publishability",
      "complete",
    ]);
  });

  it("advances one stage at a time", () => {
    expect(stageAfter("intake")).toBe("normalize");
    expect(stageAfter("google_details")).toBe("website");
    expect(stageAfter("publishability")).toBe("complete");
    expect(stageAfter("complete")).toBeNull();
  });

  it("treats review, blocked, failed and completed work as terminal for an attempt", () => {
    for (const status of ["completed", "review", "blocked", "failed", "skipped"] as const) {
      expect(TERMINAL_STAGE_STATUSES.has(status)).toBe(true);
    }
    expect(TERMINAL_STAGE_STATUSES.has("pending")).toBe(false);
    expect(TERMINAL_STAGE_STATUSES.has("running")).toBe(false);
  });
});
