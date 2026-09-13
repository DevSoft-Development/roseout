import { describe, expect, it } from "vitest";
import {
  autofillWebsiteSections,
  buildGuidedWebsiteVision,
} from "@/lib/websites/builder-guidance";
import type { WebsiteSection } from "@/lib/websites/data";

const content = {
  address: "34 S 16th Street",
  phone: "516-200-0801",
  hours: "Fri 5 PM–12 AM",
  photoCount: 8,
  menuItemCount: 14,
  reviewCount: 5,
  eventCount: 2,
  experienceCount: 1,
  reservationProvider: "TheOutHaven Reserve",
  hasReservations: true,
};

describe("website builder guidance", () => {
  it("builds a complete brief without requiring freeform owner copy", () => {
    const result = buildGuidedWebsiteVision({ choiceId: "dark", priorityId: "reservations" });
    expect(result.directionId).toBe("refined_after_dark");
    expect(result.vision).toContain("dark");
    expect(result.vision).toContain("reservations");
    expect(result.vision.length).toBeGreaterThan(10);
  });

  it("lets TheOutHaven choose while still creating a useful brief", () => {
    const result = buildGuidedWebsiteVision({ choiceId: "auto", priorityId: "photos" });
    expect(result.directionId).toBeNull();
    expect(result.vision).toContain("business type");
    expect(result.vision).toContain("photography");
  });

  it("fills missing section wording from location content", () => {
    const sections: WebsiteSection[] = [
      { id: "hero", type: "hero", enabled: true },
      { id: "gallery", type: "gallery", enabled: true, liveBindings: ["photos"] },
      { id: "menu", type: "menu", enabled: true, liveBindings: ["menu"] },
      { id: "reviews", type: "reviews", enabled: true, liveBindings: ["reviews"] },
      { id: "reservations", type: "reservations", enabled: true, liveBindings: ["reservations"] },
      { id: "contact", type: "contact", enabled: true, liveBindings: ["address", "phone"] },
    ];
    const result = autofillWebsiteSections(sections, "TheOutHaven Lounge", content);
    expect(result.every((section) => Boolean(section.heading) && Boolean(section.body))).toBe(true);
    expect(result.find((section) => section.type === "gallery")?.body).toContain("8 business photos");
    expect(result.find((section) => section.type === "menu")?.body).toContain("14 published menu items");
    expect(result.find((section) => section.type === "reservations")?.body).toContain("TheOutHaven Reserve");
  });

  it("never overwrites owner-written section copy", () => {
    const result = autofillWebsiteSections([
      { id: "about", type: "about", enabled: true, heading: "Our own heading", body: "Our own story." },
    ], "Example", content);
    expect(result[0]?.heading).toBe("Our own heading");
    expect(result[0]?.body).toBe("Our own story.");
  });
});
